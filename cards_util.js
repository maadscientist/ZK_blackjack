class Card {

    //Cards are represented with an A and a B value which are both points on the EC
    //All cards start with an A-value of "1" and a B value of g^(1 to 52)
    //However, by the time we get the card it may already be masked & shuffled so 
    constructor(elliptic_curve, A, B) {

        this.ec = elliptic_curve
       
        this.A = A; //
        this.generator = ec.curve.G;
        this.B = B; // 
    }

    set_overall_public_key(aggregateKey){
        this.aggregateKey = aggregateKey
    }

    mask(){
        //This is a slightly scuffed way to generate a random masking_factor mod q (q is order of EC)
        keyPair = ec.genKeyPair();
        const maskingFactor = keyPair.getPrivate();

        //new_a = a * g^r (r = maskingFactor)
        a = a.add(g.mult(maskingFactor)) // could more efficient
        //new_b = b * aggregateKey^r
        b = b.add(this.aggregateKey.mult(this.maskingFactor))

        //TODO: return proof
    }
    get_unmask_key(secret_key){

    }
    unmask(unmask_keys){
        let U = unmask_keys[0];
        for (let i = 1; i < unmask_keys.length; i++){
            U = U.add(unmask_keys[i]);
        }
        //Subtract U to get back original card value :)
        const card_value = this.B.add(U.neg());
        return card_value;
    }
}
function deck_setup(elliptic_curve){
    const G = elliptic_curve.G;
    let cards = []
    for(let i = 1; i < 53; i++){
         // This is equivalent of "1" or the "identity" for the group
        const card_A = this.ec.curve.point(null, null);
        const card_B = elliptic_curve.G.mult(card_value);
        cards.push(Card(elliptic_curve, card_A, card_B));
    }
}