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
    this.socket.on("Connected!", (data) => {
      console.log("Successfully connected - sending public key...");
      this.handle_public_key(this.socket);
    });
    // game initialization
    this.socket.on("game-start", (data) => {
      console.log("Game started!");
    });
    this.socket.on("player-mask", (data) => {
      console.log("Dealer is masking cards.");
    });
    this.socket.on("player-shuffle", (data) => {
      console.log("Dealer has shuffled.");
      console.log("Now it is Player's turn to mask and shuffle.")
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

    this.socket.on("player-give-deck", (deck) => {
      //Needs to: read the whole deck of 52 cards
      //Each card is an elliptic-curve point 
      //If there's a nice way to do it with JSON's or something, we could just read the whole deck rather than having to read each card and rebuild the deck :p
      //Player will also need one of these but the logic can be the exact same.
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

  handle_public_key(socket){
    const key = this.ec.genKeyPair();
    this.public_key = key.getPublic();
    this.privateKey = key.getPrivate();
    //EMIT PUBLIC KEY :)
    socket.emit("player-declare-PK", "temp");
  }

  calculate_current_total(){
    let total = 0;
    for(let i = 0; i < this.hand_values; i++){
      total += this.hand_values[i];
    }
    return total;
  }

  //TODO: Emit methods we need:
  send_deck(){
    //Emit deck in a way we can process
  }
  handle_unmask(socket, cardIndex, dealerUnmaskKey){
    //No need to check here if the card has been dealt yet
    
    //first - compute player's unmask key for that card index.
    unmask_key = this.deck.get_unmask_key(cardIndex, this.privateKey)
    //TODO: send_unmask_key
    const keys = [unmaskKey, dealerUnmaskKey]
    const actual_value = this.deck.unmask(cardIndex, keys);
    this.hand_values.push(actual_value);
    console.log("current total:" );
    console.log(this.calculate_current_total());
  }
}

// start the player
const player = new Player();
