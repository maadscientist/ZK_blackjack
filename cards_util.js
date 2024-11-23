const crypto = require('crypto');
const BN = require('bn.js')
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
class Deck{
    constructor(elliptic_curve, public_keys) {

        this.ec = elliptic_curve;
        this.G = ec.g; // generator

        //Set up communal aggregate key.
        let aggregate = public_keys[0];
        for(let i = 1; i < public_keys.length; i++){
            aggregate = aggregate.add(public_keys[i]);
        }
        this.aggregateKey = aggregate;

        //Create 52 cards
        this.cards = [];
        for(let i = 1; i < 53; i++){
            // This is equivalent of "1" or the "identity" for the group
           const card_A = elliptic_curve.curve.point(null, null);
   
           const card_B = this.G.mul(i);
           this.cards.push(new Card(card_A, card_B));
       }
    }

    mask_card(card_index){
        //This is a slightly scuffed way to generate a random masking_factor mod q (q is order of EC)
        keyPair = ec.genKeyPair();
        const maskingFactor = keyPair.getPrivate();
        let cards = this.cards;
        //Perform masking computations:
        //new_a = a * g^r (r = maskingFactor)
        this.G.add(cards[card_index].A);
        cards[card_index].A = cards[card_index].A.add(this.G.mul(maskingFactor)); // could more efficient
        //new_b = b * aggregateKey^r
        cards[card_index].B = cards[card_index].B.add(this.aggregateKey.mul(maskingFactor));

        return maskingFactor; // not necessary to return/store but useful for testing
    }

    get_unmask_key(card_index, secret_key){
        return this.cards[card_index].A.mul(secret_key);
    }
    unmask(card_index, unmask_keys){
        let U = unmask_keys[0];
        for (let i = 1; i < unmask_keys.length; i++){
            U = U.add(unmask_keys[i]);
        }

        //Subtract U to get back original card value :)
        const card_value = this.cards[card_index].B.add(U.neg());
        return card_value;
    }

    //These might be worthy of their own class but idk
    //Proves that log_g (A) = log_h (B)
    prove_knowledge(A, B, g, h, secret_key){

        const secretKeyBigInt = BigInt('0x' + secret_key.toString('hex'));

        //random k
        const randomBytes = new Uint8Array(256);
        crypto.getRandomValues(randomBytes);
        const hash1 = crypto.createHash('sha256').update(randomBytes).digest();
        const k = BigInt('0x' + hash1.toString('hex')) % BigInt(ec.curve.n);
        const k_BN = new BN(k.toString());
        //Random challenge r mod q (verifier can also get this value)
        const hash2 = crypto.createHash('sha256').update(A.add(g).add(h).add(B).getX().toString()).digest();
        // Convert hash to a BigInt and mod by curve's order
        const random_challenge = BigInt('0x' + hash2.toString('hex')) % BigInt(this.ec.curve.n);
        // console.log(random_challenge);
        return [g.mul(k_BN), h.mul(k_BN), (secretKeyBigInt*random_challenge+k) % BigInt(this.ec.curve.n), random_challenge];
    }
    verify_proof(A, B, g, h, I, J, proof){
        
        const hash2 = crypto.createHash('sha256').update(A.add(g).add(h).add(B).getX().toString()).digest();
        // Convert hash to a BigInt and mod by curve's order
        let random_challenge = BigInt('0x' + hash2.toString('hex')) % BigInt(this.ec.curve.n);

        proof =  new BN(proof.toString());
        random_challenge = new BN(random_challenge.toString());

        const first_one_true = (g.mul(proof).eq(I.add(A.mul(random_challenge))));
        const second_one_true = (h.mul(proof).eq(J.add(B.mul(random_challenge))));
        // console.log(random_challenge);;
        // console.log(g.mul(proof).getX());
        // console.log(I.add(A.mul(random_challenge)).getX());
        
        // console.log(h.mul(proof).getX());
        // console.log(J.add(B.mul(random_challenge)).getX());
        // console.log((A.mul(random_challenge)).getX());
        // console.log((B.mul(random_challenge)).getX());
        return (first_one_true && second_one_true);
    }
}

function deck_setup_test(elliptic_curve){
    const G = elliptic_curve.g;

    let secret_keys = [];
    let public_keys = [];
    for(let i = 0; i < 10; i++){
        keyPair = ec.genKeyPair();
        secret_keys.push(keyPair.getPrivate());
        public_keys.push(keyPair.getPublic());
    }

    deck = new Deck(elliptic_curve, public_keys);

    //mask cards

    for(let i = 0; i < 10; i++){
        maskingFactor = deck.mask_card(0);
    }

    //gen unmask key
    let unmask_keys = []
    for(let i = 0; i < 10; i++){
        unmask_keys.push(deck.get_unmask_key(0, secret_keys[i]));
    }

    console.log(" blah\n\n\n")
    console.log(deck.unmask(0, unmask_keys).getX());

    console.log("G\n\n\n")
    console.log(G.getX());
}
function test_knowledge_proofs(ec){
    deck = new Deck(ec, []);

    const testKeyPair = ec.genKeyPair();
    const sk = testKeyPair.getPrivate();
    const A = testKeyPair.getPublic();
    const B = (ec.g.mul(3).mul(sk));

    const secretKeyBigInt = BigInt('0x' + sk.toString('hex'));
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
    proof =  new BN(proof.toString());
    // console.log(ec.g.mul(proof).getX())
    // console.log(A.getX())
    // console.log(A.mul(random_challenge).getX())
    console.log(deck.verify_proof(A, B, ec.g, ec.g.mul(3), I1, I2, proof));
}
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
// deck_setup_test(ec);
test_knowledge_proofs(ec);
