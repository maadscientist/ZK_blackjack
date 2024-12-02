const crypto = require("crypto");
const BN = require("bn.js");
const EC = require("elliptic").ec;
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

class Card {
  //Cards are represented with an A and a B value which are both points on the EC
  //All cards start with an A-value of "1" and a B value of g^(1 to 52)
  //However, by the time we get the card it may already be masked & shuffled so
  constructor(A, B) {
    this.A = A; //
    this.B = B; //
    // console.log(typeof(this.A));
  }
}
class Deck {
  constructor(elliptic_curve, public_keys) {
    this.ec = elliptic_curve;
    this.G = ec.g; // generator

    //Set up communal aggregate key.
    let aggregate = public_keys[0];
    for (let i = 1; i < public_keys.length; i++) {
      aggregate = aggregate.add(public_keys[i]);
    }
    this.aggregateKey = aggregate;

    //Create 52 cards
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
    // not needed - used just for checks
    // if (this.witness_data.shuffled_deck.length >= 52) {
    //   console.warn("Attempting to mask more than 52 cards");
    //   return null;
    // }

    //This is a slightly scuffed way to generate a random masking_factor mod q (q is order of EC)
    keyPair = ec.genKeyPair();
    const maskingFactor = keyPair.getPrivate();
    let cards = this.cards;
    //Perform masking computations:
    //new_a = a * g^r (r = maskingFactor)
    this.G.add(cards[card_index].A);
    cards[card_index].A = cards[card_index].A.add(this.G.mul(maskingFactor)); // could more efficient
    //new_b = b * aggregateKey^r
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

  get_unmask_key(card_index, secret_key) {
    return this.cards[card_index].A.mul(secret_key);
  }

  unmask(card_index, unmask_keys) {
    let U = unmask_keys[0];
    for (let i = 1; i < unmask_keys.length; i++) {
      U = U.add(unmask_keys[i]);
    }

    //Subtract U to get back original card value :)
    const card_value = this.cards[card_index].B.add(U.neg());
    return card_value;
  }

  //These might be worthy of their own class but idk
  //Proves that log_g (A) = log_h (B)
  prove_knowledge(A, B, g, h, secret_key) {
    const secretKeyBigInt = BigInt("0x" + secret_key.toString("hex"));

    //random k
    const randomBytes = new Uint8Array(256);
    crypto.getRandomValues(randomBytes);
    const hash1 = crypto.createHash("sha256").update(randomBytes).digest();
    const k = BigInt("0x" + hash1.toString("hex")) % BigInt(ec.curve.n);
    const k_BN = new BN(k.toString());
    //Random challenge r mod q (verifier can also get this value)
    const hash2 = crypto
      .createHash("sha256")
      .update(A.add(g).add(h).add(B).getX().toString())
      .digest();
    // Convert hash to a BigInt and mod by curve's order
    const random_challenge =
      BigInt("0x" + hash2.toString("hex")) % BigInt(this.ec.curve.n);
    // console.log(random_challenge);
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
    // console.log(random_challenge);;
    // console.log(g.mul(proof).getX());
    // console.log(I.add(A.mul(random_challenge)).getX());

    // console.log(h.mul(proof).getX());
    // console.log(J.add(B.mul(random_challenge)).getX());
    // console.log((A.mul(random_challenge)).getX());
    // console.log((B.mul(random_challenge)).getX());
    return first_one_true && second_one_true;
  }

  // wrapper for calling the proof generator
  async generate_shuffle_proof() {
    // check deck lengths - might not be needed at all since it's initialized properly
    // i ran into this error before initializing, so keeping this just in case
    if (
      this.witness_data.original_deck.length !== 52 ||
      this.witness_data.shuffled_deck.length !== 52 ||
      this.witness_data.permutation.length !== 52
    ) {
      this.witness_data_init();
      throw new Error("Invalid deck lengths.");
    }

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

      console.log("Witness written!");

      const proof = await proofGenerator.generate_proof();

      return proof;
    } catch (error) {
      console.error("Shuffle proof generation error:", error);
      throw error;
    }
  }

  // shuffle by exchanging current card's position w/ a random card
  shuffle() {
    this.witness_data.shuffled_deck = [];

    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }

    // note the shuffled deck and permutations down
    for (let i = 0; i < 52; i++) {
      this.witness_data.shuffled_deck.push(this.cards[i].B.getX().toString());
      this.witness_data.permutation[i] = this.cards.indexOf(
        this.originalCards[i]
      );
    }

    return this;
  }
}

// commented this out since this wasn't used anywhere

// function deck_setup_test(elliptic_curve) {
//   const G = elliptic_curve.g;

//   let secret_keys = [];
//   let public_keys = [];
//   for (let i = 0; i < 10; i++) {
//     keyPair = ec.genKeyPair();
//     secret_keys.push(keyPair.getPrivate());
//     public_keys.push(keyPair.getPublic());
//   }

//   deck = new Deck(elliptic_curve, public_keys);

//   //mask cards

//   for (let i = 0; i < 10; i++) {
//     maskingFactor = deck.mask_card(0);
//   }

//   //gen unmask key
//   let unmask_keys = [];
//   for (let i = 0; i < 10; i++) {
//     unmask_keys.push(deck.get_unmask_key(0, secret_keys[i]));
//   }

//   console.log(" blah\n\n\n");
//   console.log(deck.unmask(0, unmask_keys).getX());

//   console.log("G\n\n\n");
//   console.log(G.getX());
// }

function test_knowledge_proofs(ec) {
  deck = new Deck(ec, []);

  const testKeyPair = ec.genKeyPair();
  const sk = testKeyPair.getPrivate();
  const A = testKeyPair.getPublic();
  const B = ec.g.mul(3).mul(sk);

  const secretKeyBigInt = BigInt("0x" + sk.toString("hex"));
  const secretKeyBN = new BN(secretKeyBigInt.toString());
  // console.log(ec.g.mul(secretKeyBN).getX())
  // console.log(ec.g.mul(sk).getX());

  lis = deck.prove_knowledge(A, B, ec.g, ec.g.mul(3), sk); // dont ask
  I1 = lis[0];
  I2 = lis[1];
  proof = lis[2];
  let random_challenge = lis[3];
  random_challenge = new BN(random_challenge.toString());

  // console.log(proof);
  proof = new BN(proof.toString());
  // console.log(ec.g.mul(proof).getX())
  // console.log(A.getX())
  // console.log(A.mul(random_challenge).getX())
  console.log(deck.verify_proof(A, B, ec.g, ec.g.mul(3), I1, I2, proof));
}

const ec = new EC("secp256k1");
// deck_setup_test(ec);
// test_knowledge_proofs(ec);

// ---------------------------------------------------

class ShuffleProofGenerator {
  constructor() {
    // file paths for different files used in proof
    this.circuit_path = path.join(__dirname, "circuit.circom");
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

  generate_proof() {
    // helper function to run commands and wait for completion
    // helps with in order execution
    function runCommand(command) {
      return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            reject(`Command failed: ${error.message}`);
            return;
          }
          if (stderr) {
            console.error(`stderr: ${stderr}`);
          }
          resolve(stdout); // resolve promise when command completes
        });
      });
    }

    // helper function to handle zkey contribute with user input
    function runZkeyContribute(gkey_path, pkey_path) {
      return new Promise((resolve, reject) => {
        const contribute = exec(
          `snarkjs zkey contribute ${gkey_path} ${pkey_path}`
        );

        process.stdin.pipe(contribute.stdin); // receive input

        contribute.stdout.on("data", (data) => {
          console.log(data);
        });

        contribute.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(`Zkey contribute failed with code ${code}`);
          }
        });
      });
    }

    // run all commands for proof generation and verification
    return new Promise(async (resolve, reject) => {
      try {
        // compile the circom circuit
        await runCommand(`circom ${this.circuit_path} --r1cs --wasm`);
        console.log("Compiled circom circuit!");

        // compile input.json to a .wtns file
        await runCommand(
          `snarkjs wtns calculate ${this.circuit_name}.wasm ${this.witness_path} ${this.witness_name}.wtns`
        );
        console.log("Compiled witness!");

        // setup groth16, pls dont ask
        await runCommand(
          `snarkjs groth16 setup ${this.circuit_name}.r1cs powersOfTau28_hez_final_10.ptau ${this.gkey_path}`
        );

        console.log(this.gkey_path);
        // generate proving key
        await runZkeyContribute(this.gkey_path, this.pkey_path);
        console.log("Proving key generated!");

        // generate verification key
        await runCommand(`snarkjs zkev ${this.pkey_path} ${this.vkey_path}`);
        console.log("Verification key generated!");

        // generate proof
        await runCommand(
          `snarkjs groth16 prove ${this.pkey_path} ${this.witness_name}.wtns ${this.proof_path} ${this.public_path}`
        );
        console.log("Proof generated!");

        // verify proof (ALWAYS TRUE!!!!!!!)
        console.log("Verifying proof....");
        await runCommand(
          `snarkjs groth16 verify ${this.vkey_path} ${this.public_path} ${this.proof_path}`
        );

        // read the proof from the file to resolve
        const proof = JSON.parse(fs.readFileSync(this.proof_path, "utf8"));
        resolve(proof);
      } catch (error) {
        reject(error);
      }
    });
  }

  // removes witness, proof, key, statement and circuit files
  cleanup() {
    const filesToRemove = [
      this.witness_path,
      this.proof_path,
      this.public_path,
      `${this.circuit_name}.r1cs`,
      `${this.circuit_name}.wasm`,
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
    const shuffleProof = await deck.generate_shuffle_proof();
    console.log("Shuffle Proof Generated:", shuffleProof);
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
