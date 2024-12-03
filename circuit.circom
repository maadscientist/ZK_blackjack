pragma circom 2.2.1;

template permCheck() {

    signal input original_deck[52];
    signal input shuffled_deck[52];
    signal input permutation[52];
    signal output valid;

    for (var i = 0; i < 52; i++) {
        assert(permutation[i] < 52);
        assert(permutation[i] >= 0);
        for (var j = 0; j < 52; j++) {
            if (j != i) {
                assert(permutation[i] != permutation[j]);
            }
        }
    }

    for (var i=0; i < 52; i++) {
        var idx = permutation[i];
        assert(original_deck[i] == shuffled_deck[idx]);
    }

    valid <== 1;
}

component main = permCheck();