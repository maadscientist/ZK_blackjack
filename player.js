const io = require("socket.io-client");
const { Deck, Card } = require("./cards_util");
// we're taking input via console
const readline = require("readline");

class Player {
  // connect to dealer at port 3000
  constructor(serverUrl = "http://localhost:3000") {
    this.socket = io(serverUrl);
    this.deck = null;
    this.hand = [];

    this.setup_listeners();
    this.setup_console();
  }

  setup_listeners() {
    // game initialization
    this.socket.on("game-start", (data) => {
      console.log("Game started!");
    });

    // receive game result
    this.socket.on("game-result", (result) => {
      console.log("Game result:", result);
    });

    //TODO: Need sockets for: 

    socket.on("dealer-declare-PK", (PK) => {
      //Needs to: read in dealer's public key (elliptic curve point object)
    });

    socket.on("dealer-unmask-card", (unmaskKey) => {
      //Needs to: read in dealer's unmask key (is an elliptic curve point object)
      //Dealer also has a version - logic can be the same
      
    });

    socket.on("player-give-deck", (deck) => {
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
  
  //TODO: Emit methods we need:
  send_deck(){
    //Emit deck in a way we can process
  }
  handle_unmask(socket, cardIndex){
    //first - compute player's unmask key for that card index.
    this.deck.get_unmask_key(cardIndex, this.privateKey)
    //Need a way to send unmask key (Elliptic Curve point)
  }
}

// start the player
const player = new Player();
