const crypto = require("crypto");
const BN = require("bn.js");
const EC = require("elliptic").ec;
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const ec = new EC("secp256k1");
const { performance } = require("perf_hooks");

class Card {
  // Cards are represented with an A and a B value which are both points on the EC
  // All cards start with an A-value of "1" and a B value of g^(1 to 52)
  // However, by the time we get the card it may already be masked & shuffled so
  constructor(A, B) {
    this.A = A;
    this.B = B;
  }
}
class Deck {
  constructor(elliptic_curve, public_keys) {
    this.ec = elliptic_curve;
    this.G = ec.g; // generator
    this.pks = public_keys;

    // Set up communal aggregate key.
    let aggregate = public_keys[0];
    for (let i = 1; i < public_keys.length; i++) {
      aggregate = aggregate.add(public_keys[i]);
    }
    this.aggregateKey = aggregate;

    // Create 52 cards
    this.cards = [];
    this.originalCards = [];
    for (let i = 1; i < 53; i++) {
      // This is equivalent of "1" or the "identity" for the group
      const card_A = elliptic_curve.curve.point(null, null);

      const card_B = this.G.mul(i);
      const card = new Card(card_A, card_B);
      this.cards.push(card);
      this.originalCards.push(card);
    }

    // Witness data
    this.witness_data = {
      original_deck: [],
      shuffled_deck: [],
      permutation: [],
    };

    this.witness_data_init();
  }

  // initializes the orginal deck and permutations [0, ..., 52] for witness data
  witness_data_init() {
    this.witness_data.original_deck = [];
    this.witness_data.shuffled_deck = [];
    this.witness_data.permutation = [];

    for (let i = 0; i < 52; i++) {
      this.witness_data.original_deck.push(this.cards[i].B.getX().toString());
      this.witness_data.permutation.push(i);
    }
  }

  mask_card(card_index) {
    // This is a slightly scuffed way to generate a random masking_factor mod q (q is order of EC)
    const keyPair = ec.genKeyPair();
    const maskingFactor = keyPair.getPrivate();
    let cards = this.cards;

    // Perform masking computations

    this.G.add(cards[card_index].A);
    cards[card_index].A = cards[card_index].A.add(this.G.mul(maskingFactor));
    cards[card_index].B = cards[card_index].B.add(
      this.aggregateKey.mul(maskingFactor)
    );

    // insert into the shuffled deck
    if (this.witness_data.shuffled_deck.length < 52) {
      this.witness_data.shuffled_deck.push(
        cards[card_index].B.getX().toString()
      );
    }
    return maskingFactor; // not necessary to return/store but useful for testing
  }

  // Masks all cards in the deck
  mask_cards() {
    for (let i = 0; i < 52; i++) {
      this.mask_card(i);
    }
  }

  get_unmask_key(card_index, secret_key) {
    return this.cards[card_index].A.mul(secret_key);
  }

  unmask(card_index, unmask_keys) {
    let U = unmask_keys[0];
    for (let i = 1; i < unmask_keys.length; i++) {
      U = U.add(unmask_keys[i]);
    }

    // Subtract U to get back original card value :)
    const card_value = this.cards[card_index].B.add(U.neg());
    return this.get_original_value(card_value);
  }

  // Private helper method - Brute force check to retrieve original value of the card.
  get_original_value(card_value) {
    for (let i = 1; i < 53; i++) {
      if (this.G.mul(i).eq(card_value)) {
        if (i % 13 == 0) {
          return 11;
        } else if (i % 13 >= 10) {
          return 10;
        } else {
          return (i % 13) + 1;
        }
      }
    }
    return -1;
  }

  // These might be worthy of their own class but idk
  // Proves that log_g (A) = log_h (B)
  prove_knowledge(A, B, g, h, secret_key) {
    const secretKeyBigInt = BigInt("0x" + secret_key.toString("hex"));

    // random k
    const randomBytes = new Uint8Array(256);
    crypto.getRandomValues(randomBytes);
    const hash1 = crypto.createHash("sha256").update(randomBytes).digest();
    const k = BigInt("0x" + hash1.toString("hex")) % BigInt(ec.curve.n);
    const k_BN = new BN(k.toString());

    // Random challenge r mod q (verifier can also get this value)
    const hash2 = crypto
      .createHash("sha256")
      .update(A.add(g).add(h).add(B).getX().toString())
      .digest();

    // Convert hash to a BigInt and mod by curve's order
    const random_challenge =
      BigInt("0x" + hash2.toString("hex")) % BigInt(this.ec.curve.n);
    return [
      g.mul(k_BN),
      h.mul(k_BN),
      (secretKeyBigInt * random_challenge + k) % BigInt(this.ec.curve.n),
      random_challenge,
    ];
  }

  verify_proof(A, B, g, h, I, J, proof) {
    const hash2 = crypto
      .createHash("sha256")
      .update(A.add(g).add(h).add(B).getX().toString())
      .digest();
    // Convert hash to a BigInt and mod by curve's order
    let random_challenge =
      BigInt("0x" + hash2.toString("hex")) % BigInt(this.ec.curve.n);

    proof = new BN(proof.toString());
    random_challenge = new BN(random_challenge.toString());

    const first_one_true = g.mul(proof).eq(I.add(A.mul(random_challenge)));
    const second_one_true = h.mul(proof).eq(J.add(B.mul(random_challenge)));
    return first_one_true && second_one_true;
  }

  // wrapper for calling the proof generator
  generate_shuffle_proof() {
    const proofGenerator = new ShuffleProofGenerator();

    try {
      // remove old proof files if any
      proofGenerator.cleanup();
      console.log("Cleaned old files!");

      // write witness data to file
      proofGenerator.write_witness(
        this.witness_data.original_deck,
        this.witness_data.shuffled_deck,
        this.witness_data.permutation
      );

      proofGenerator.generate_proof();
    } catch (error) {
      console.error("Shuffle proof generation error:", error);
      throw error;
    }
  }

  // wrapper for calling the proof verifier
  verify_shuffle_proof() {
    const proofGenerator = new ShuffleProofGenerator();

    try {
      proofGenerator.verify_proof();
    } catch (error) {
      console.error("Shuffle proof generation error:", error);
      throw error;
    }
  }

  // shuffle by exchanging current card's position w/ a random card
  shuffle() {
    this.witness_data.original_deck = [];
    this.witness_data.shuffled_deck = [];

    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }

    // note the shuffled deck and permutations down
    for (let i = 0; i < 52; i++) {
      this.witness_data.shuffled_deck.push(this.cards[i].B.getX().toString());
      this.witness_data.original_deck.push(
        this.originalCards[i].B.getX().toString()
      );
      this.witness_data.permutation[i] = this.cards.indexOf(
        this.originalCards[i]
      );
    }

    return this;
  }

  // serialize deck before sending
  serializeDeck() {
    let serializedCards = [];
    for (let i = 0; i < this.cards.length; i++) {
      serializedCards.push(Deck.serializeCard(this.cards[i]));
    }
    let serializedPKs = [];
    for (let i = 0; i < this.pks.length; i++) {
      serializedPKs.push(Deck.serializePoint(this.pks[i]));
    }
    this.witness_data_init();
    const serializedDeck = {
      public_keys: serializedPKs,
      witness_data: this.witness_data,
      cards: serializedCards,
    };
    return serializedDeck;
  }

  // deserialize deck after receiving
  static reconstructDeck(serializedDeck) {
    let new_cards = [];
    for (let i = 0; i < serializedDeck.cards.length; i++) {
      new_cards.push(Deck.reconstructCard(serializedDeck.cards[i]));
    }
    // this.cards = new_cards;
    // this.originalCards = new_cards;

    let new_PKs = [];
    for (let i = 0; i < serializedDeck.public_keys.length; i++) {
      new_PKs.push(Deck.reconstructPoint(serializedDeck.public_keys[i]));
    }

    let d = new Deck(new EC("secp256k1"), new_PKs);
    d.cards = new_cards;
    d.originalCards = new_cards;
    d.witness_data = serializedDeck.witness_data;
    return d;
  }

  static serializePoint(point) {
    const serializedPoint = {
      x: point.getX().toString("hex"),
      y: point.getY().toString("hex"),
    };
    return serializedPoint;
  }
  static reconstructPoint(data) {
    const xBN = new BN(data.x, 16);
    const yBN = new BN(data.y, 16);
    const point = ec.curve.point(xBN, yBN);
    return point;
  }
  static reconstructCard(serializedCard) {
    let c = new Card();
    c.A = this.reconstructPoint(serializedCard.A);
    c.B = this.reconstructPoint(serializedCard.B);
    return c;
  }
  static serializeCard(card) {
    const serializedCard = {
      A: this.serializePoint(card.A),
      B: this.serializePoint(card.B),
    };
    return serializedCard;
  }
}

// test function
function deck_setup_test(elliptic_curve) {
  const G = elliptic_curve.g;

  let secret_keys = [];
  let public_keys = [];
  for (let i = 0; i < 10; i++) {
    keyPair = ec.genKeyPair();
    secret_keys.push(keyPair.getPrivate());
    public_keys.push(keyPair.getPublic());
  }

  deck = new Deck(elliptic_curve, public_keys);

  //mask cards

  for (let i = 0; i < 10; i++) {
    maskingFactor = deck.mask_cards();
  }
  deck.shuffle();
  const card_to_unmask = 5;
  //gen unmask key
  let unmask_keys = [];
  for (let i = 0; i < 10; i++) {
    unmask_keys.push(deck.get_unmask_key(card_to_unmask, secret_keys[i]));
  }
}

// deck_setup_test(ec);

// ---------------------------------------------------

class ShuffleProofGenerator {
  constructor() {
    // file paths for different files used in proof
    this.circuit_path = path.join(__dirname, "circuit.circom");
    this.wasm_path = path.join(__dirname, "circuit_js/circuit.wasm");
    this.witness_path = path.join(__dirname, "input.json");
    this.proof_path = path.join(__dirname, "proof.json");
    this.public_path = path.join(__dirname, "public.json");
    this.gkey_path = path.join(__dirname, "circuit_0000.zkey");
    this.pkey_path = path.join(__dirname, "circuit_0001.zkey");
    this.vkey_path = path.join(__dirname, "verification_key.json");

    // remove file extensions

    this.circuit_name = path.parse(this.circuit_path).name;
    this.witness_name = path.parse(this.witness_path).name;
  }

  // write witness data to input.json
  // contains the the original and shuffled decks, and the permutations
  write_witness(original_deck, shuffled_deck, permutation) {
    const witnessData = {
      original_deck,
      shuffled_deck,
      permutation,
    };

    fs.writeFileSync(this.witness_path, JSON.stringify(witnessData, null, 2));
  }

  verify_proof() {
    try {
      const startTime = performance.now();
      // Helper function for running a command synchronously
      function runCommandSync(command) {
        try {
          execSync(command, { encoding: "utf-8" });
        } catch (error) {
          console.error(`Command failed: ${command}`);
          throw new Error(error.message);
        }
      }

      // Verify proof
      console.log("Verifying shuffle proof...");
      runCommandSync(
        `snarkjs groth16 verify ${this.vkey_path} ${this.public_path} ${this.proof_path}`
      );

      const endTime = performance.now();

      console.log("Proof verification successful!");
      console.log(
        `Proof verification took ${endTime - startTime} milliseconds.`
      );
    } catch (error) {
      console.error("Error during proof verification:", error.message);
      throw error;
    }
  }

  generate_proof() {
    try {
      // Helper function for running a command synchronously
      function runCommandSync(command) {
        try {
          execSync(command, { encoding: "utf-8" });
        } catch (error) {
          console.error(`Command failed: ${command}`);
          throw new Error(error.message);
        }
      }

      // Helper function for synchronous user input during zkey contribution
      function runZkeyContributeSync(gkey_path, pkey_path) {
        try {
          execSync(`snarkjs zkey contribute ${gkey_path} ${pkey_path}`, {
            stdio: "inherit",
          });
        } catch (error) {
          throw new Error(`Zkey contribute failed: ${error.message}`);
        }
      }

      const witnessStartTime = performance.now();
      // Compile the circom circuit
      runCommandSync(`circom ${this.circuit_path} --r1cs --wasm`);
      console.log("Compiled circom circuit!");

      // Compile input.json to a .wtns file
      runCommandSync(
        `snarkjs wtns calculate ${this.wasm_path} ${this.witness_path} ${this.witness_name}.wtns`
      );
      const witnessEndTime = performance.now();
      console.log("Compiled witness!");
      console.log(
        `Witness generation took ${
          witnessEndTime - witnessStartTime
        } milliseconds.`
      );

      // Setup groth16
      runCommandSync(
        `snarkjs groth16 setup ${this.circuit_name}.r1cs powersOfTau28_hez_final_10.ptau ${this.gkey_path}`
      );
      console.log("Groth16 setup completed!");

      // Generate proving key
      runZkeyContributeSync(this.gkey_path, this.pkey_path);
      console.log("Proving key generated!");

      // Generate verification key
      runCommandSync(`snarkjs zkev ${this.pkey_path} ${this.vkey_path}`);
      console.log("Verification key generated!");

      const proofGenStartTime = performance.now();
      // Generate proof
      runCommandSync(
        `snarkjs groth16 prove ${this.pkey_path} ${this.witness_name}.wtns ${this.proof_path} ${this.public_path}`
      );

      // Read the proof from the file
      const proof = JSON.parse(fs.readFileSync(this.proof_path, "utf8"));
      const proofGenEndTime = performance.now();

      console.log("Proof generated!");

      console.log(
        `Proof generation took ${
          proofGenEndTime - proofGenStartTime
        } milliseconds.`
      );

      return proof;
    } catch (error) {
      console.error("Error during proof generation:", error.message);
      throw error;
    }
  }

  // removes witness, proof, key, statement and circuit files
  cleanup() {
    const filesToRemove = [
      this.witness_path,
      this.proof_path,
      this.public_path,
      this.wasm_path,
      `${this.circuit_name}.r1cs`,
      `${this.witness_name}.wtns`,
      this.gkey_path,
      this.pkey_path,
      this.vkey_path,
    ];

    filesToRemove.forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  }
}

// test Function
async function shuffle_test(elliptic_curve) {
  const G = elliptic_curve.g;

  let secret_keys = [];
  let public_keys = [];
  for (let i = 0; i < 10; i++) {
    const keyPair = elliptic_curve.genKeyPair();
    secret_keys.push(keyPair.getPrivate());
    public_keys.push(keyPair.getPublic());
  }

  const deck = new Deck(elliptic_curve, public_keys);

  // shuffle deck
  deck.shuffle();

  try {
    await deck.generate_shuffle_proof();
    console.error("Success.");
  } catch (error) {
    console.error("TEST FAILED!!");
  }
}

// shuffle_test(ec).catch(console.error);

// export classes
module.exports = {
  Card: Card,
  Deck: Deck,
};
