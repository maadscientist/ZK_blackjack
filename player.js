const io = require("socket.io-client");
const { Deck, Card } = require("./cards_util");
const readline = require("readline");
const EC = require("elliptic").ec;

class Player {
  // connect to dealer at port 3000
  constructor(serverUrl = "http://localhost:3000") {
    this.socket = io(serverUrl);
    this.deck = null;
    // hand stores the raw 'indices' of the cards
    // hand_values stores the actual values of the cards once they are unmasked.
    this.hand = [];
    this.hand_values = [];

    this.setup_listeners();
    this.setup_console();

    this.ec = new EC("secp256k1");
    this.game_ending = false;
  }

  setup_listeners() {
    // game initialization
    this.socket.on("connected", (data) => {
      console.log("-------------------------------------");
      console.log("Successfully connected!");
      console.log("-------------------------------------");
      this.handle_public_key(this.socket);
    });

    this.socket.on("game-start", (data) => {
      console.log("GAME STARTED!");
    });

    this.socket.on("dealer-mask", (data) => {
      console.log("Dealer has masked.");
    });

    this.socket.on("dealer-shuffle", (data) => {
      console.log("Dealer has shuffled.");
      console.log("-------------------------------------");
    });

    this.socket.on("deal-card-player", (card) => {
      console.log("-------------------------------------");
      console.log("You've drawn a card.");
      this.hand.push(card);
    });

    this.socket.on("reveal-dealer-card", (card) => {
      console.log("Revealing dealer's card!");
      this.hand.push(card);
      this.game_ending = true;
    });

    this.socket.on("dealer-declare-PK", (message) => {
      // read in dealer's public key (elliptic curve point object)
      this.dealer_PK = Deck.reconstructPoint(message.publicKey);
      console.log("Received Dealer's PK: ", this.dealer_PK.getX());
      console.log("-------------------------------------");
    });

    this.socket.on("dealer-unmask-card", (cardAndKey) => {
      // read in dealer's unmask key (is an elliptic curve point object)
      // Dealer also has a version - logic can be the same
      const cardIndex = cardAndKey.cardIndex;
      const unmaskKey = Deck.reconstructPoint(cardAndKey.unmaskKey);
      const unmaskKey2 = this.deck.get_unmask_key(cardIndex, this.privateKey);
      console.log("Unmasking card...");

      const card = this.deck.unmask(cardIndex, [unmaskKey, unmaskKey2]);
      console.log("Revealed: " + card);
      this.hand_values.push(card);
      console.log("Your hand: ", this.hand_values);
      console.log("Your current total: ", this.calculate_current_total());
      console.log("-------------------------------------");
      if (this.game_ending) {
        if (
          this.calculate_current_total() <= 21 &&
          this.calculate_current_total() >= 15
        ) {
          console.log("You Win! :)");
          console.log("-------------------------------------");
          this.socket.emit("result", 1);
          this.socket.disconnect();
          process.exit();
        } else {
          console.log("You Lose! :(");
          console.log("-------------------------------------");
          this.socket.emit("result", 0);
          this.socket.disconnect();
          process.exit();
        }
      } else {
        console.log("Hit or stand?");
      }
    });

    // receives the deck from dealer and parses it
    this.socket.on("send-deck", (data) => {
      console.log("Received deck and proof!");
      console.log("-------------------------------------");

      this.deck = Deck.reconstructDeck(data);

      this.deck.verify_shuffle_proof();
      console.log("-------------------------------------");

      // dealer masks
      this.deck.mask_cards();

      console.log("Player has finished masking.");
      this.socket.emit("player-mask");

      // dealer shuffles
      this.deck.shuffle();

      console.log("Player has finished shuffling.");
      console.log("-------------------------------------");

      console.log("Generating proof...");
      this.deck.generate_shuffle_proof();
      console.log("-------------------------------------");
      this.socket.emit("player-shuffle");

      // send deck to player
      console.log("Sending deck and proof to dealer...");
      console.log("-------------------------------------");
      this.send_deck(this.socket);
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

  handle_public_key(socket) {
    const key = this.ec.genKeyPair();
    this.publicKey = key.getPublic();
    this.privateKey = key.getPrivate();
    // EMIT PUBLIC KEY :)
    const PK_serialized = Deck.serializePoint(this.publicKey);
    socket.emit("player-declare-PK", {
      publicKey: PK_serialized,
    });
  }

  calculate_current_total() {
    let total = 0;
    for (let i = 0; i < this.hand_values.length; i++) {
      total += this.hand_values[i];
    }
    return total;
  }

  send_deck(socket) {
    // Emit deck in a way we can process
    socket.emit("send-deck", this.deck.serializeDeck());
  }
}

// start the player
const player = new Player();
