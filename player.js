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
}

// start the player
const player = new Player();
