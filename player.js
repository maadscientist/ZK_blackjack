const io = require("socket.io-client");
const { Deck, Card } = require("./cards_util");
// we're taking input via console
const readline = require("readline");
const EC = require("elliptic").ec;

class Player {
  // connect to dealer at port 3000
  constructor(serverUrl = "http://localhost:3000") {
    this.socket = io(serverUrl);
    this.deck = null;
    //hand stores the raw 'indices' of the cards
    //hand_values stores the actual values of the cards once they are unmasked.
    this.hand = [];
    this.hand_values = [];

    this.setup_listeners();
    this.setup_console();

    this.ec = new EC("secp256k1");
  }

  setup_listeners() {
    // game initialization
    this.socket.on("connected", (data) => {
      console.log("Successfully connected - sending public key...");
      this.handle_public_key(this.socket);
    });
    // game initialization
    this.socket.on("game-start", (data) => {
      console.log("Game started!");
    });
    this.socket.on("dealer-mask", (data) => {
      console.log("Dealer has masked.");
    });
    this.socket.on("dealer-shuffle", (data) => {
      console.log("Dealer has shuffled.");
    });

    // receive game result
    this.socket.on("game-result", (result) => {
      console.log("Game result:", result);
    });

    this.socket.on("deal-card-player", (card) => {
      this.hand.push(card);
    });

    //TODO: Need sockets for:

    this.socket.on("dealer-declare-PK", (PK) => {
      //Needs to: read in dealer's public key (elliptic curve point object)
    });

    this.socket.on("dealer-unmask-card", (unmaskKey) => {
      //Needs to: read in dealer's unmask key (is an elliptic curve point object)
      //Dealer also has a version - logic can be the same
    });

    // receives the deck from dealer and parses it
    this.socket.on("send-deck", (data) => {
      console.log("Received deck!");
      // console.log(data);

      this.deck = this.unpack_deck(data);
      console.log(this.deck);

      // After initializing deck, uncomment this
      /*
      console.log("Deck received:", this.deck);
      // dealer masks
      console.log("Player is masking...");
      this.deck;
      console.log("Player has finished masking.");
      this.socket.emit("player-mask");

      // dealer shuffles
      console.log("Player is shuffling...");
      this.deck.shuffle();
      console.log("Player has finished shuffling.");
      this.socket.emit("player-shuffle");

      // send deck to player
      // console.log("Deck in hand:", this.deck);
      console.log("Sending deck to dealer...");
      this.send_deck();*/
    });
  }

  setup_console() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // input handler
    rl.on("line", (input) => {
      switch (input.toLowerCase()) {
        // player wants to draw a card
        case "hit":
          // emit "player-action" event to dealer saying that they want to "hit"
          this.socket.emit("player-action", { type: "hit" });
          break;
        case "stand":
          // emit "player-action" event to dealer saying that they want to "stand"
          // in our case, this means the player calls for the end of the game
          this.socket.emit("player-action", { type: "stand" });
          break;
      }
    });
  }

  unpack_deck(data) {
    // this is the logic, will have to alter to work properly
    const elliptic_curve = data.elliptic_curve;
    const public_keys = data.public_keys;

    const deck = new Deck(elliptic_curve, public_keys);

    deck.cards = data.cards;
    deck.originalCards = data.cards;
    deck.witness_data = data.witness_data;

    return deck;
  }

  handle_public_key(socket) {
    const key = this.ec.genKeyPair();
    this.public_key = key.getPublic();
    this.privateKey = key.getPrivate();
    //EMIT PUBLIC KEY :)
    socket.emit("player-declare-PK", this.public_key);
  }

  calculate_current_total() {
    let total = 0;
    for (let i = 0; i < this.hand_values; i++) {
      total += this.hand_values[i];
    }
    return total;
  }

  //TODO: Emit methods we need:
  send_deck() {
    //Emit deck in a way we can process
    this.io.emit("send-deck", this.deck.pack_deck());
  }

  handle_unmask(socket, cardIndex, dealerUnmaskKey) {
    //No need to check here if the card has been dealt yet

    //first - compute player's unmask key for that card index.
    unmask_key = this.deck.get_unmask_key(cardIndex, this.privateKey);
    //TODO: send_unmask_key
    const keys = [unmaskKey, dealerUnmaskKey];
    const actual_value = this.deck.unmask(cardIndex, keys);
    this.hand_values.push(actual_value);
    console.log("current total:");
    console.log(this.calculate_current_total());
  }
}

// start the player
const player = new Player();
