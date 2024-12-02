const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { Deck, Card } = require("./cards_util");
const EC = require("elliptic").ec;

class Dealer {
  // initialize dealer at port 3000
  constructor(port = 3000) {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server);

    this.deck = null;
    // this is the card that the dealer will be having
    // reveal only when player decides to "stand"
    this.dealer_card = null;
    this.players = [];

    this.setup_listeners();
    this.start_server(port);
  }

  // these will listen to any event from the player
  // (whatever the player emits)
  setup_listeners() {
    // listen for any connection to the port
    this.io.on("connection", (socket) => {
      console.log("Player connected");
      this.players.push(socket);

      // initialize game when a player connects
      if (this.players.length >= 1) {
        this.initialize_game();
      }

      // handle player actions - hit, stand
      socket.on("player-action", (action) => {
        this.process_player_action(socket, action);
      });

      // handle disconnection
      socket.on("disconnect", () => {
        this.players = this.players.filter((p) => p !== socket);
        console.log("Player disconnected");
      });
    });
  }

  initialize_game() {
    // TODO: set up ec and public keys for deck
    const ec = new EC("secp256k1");
    const publicKeys = [];

    // create a shuffled deck
    this.deck = new Deck(ec, publicKeys);
    this.deck.shuffle();

    // NOTE: all implementations except hits for the player are emitted as an event
    // we need to handle them in the player.js file
    // we can implement the dealer actions in this file

    // TODO: p1 mask deck
    this.io.emit("player-mask", {
      message: "Player is masking...",
    });

    // TODO: p1 shuffle deck
    this.io.emit("player-shuffle", {
      message: "Player is shuffling...",
    });

    // TODO: p2 mask deck
    // .
    // .
    // .

    // TODO: p2 shuffle deck
    // .
    // .
    // .

    // NOTE: I think I have the right way to draw the cards in handle_hit() function

    // TODO: dealer gets a card
    // .
    // .
    // .

    // TODO: player gets a card
    // we could also use the handle_hit() function to give the player a card
    // .
    // .
    // .

    // TODO: unmask player's card
    this.io.emit("player-unmask", {
      message: "Player reveals the card...",
    });

    // broadcast game start
    this.io.emit("game-start", {
      message: "Game is starting...",
    });
  }

  // helper for handling player actions
  process_player_action(socket, action) {
    switch (action.type) {
      case "hit":
        this.handle_hit(socket);
        break;
      case "stand":
        this.handle_stand(socket);
        break;
    }
  }

  handle_hit(socket) {
    // give player a card from the deck
    // we could also have a check - if the sum of JUST the players' cards (because we haven't revealed the dealer's card yet) is above 21, do not handle hit and declare the loss of the player
    const newCard = this.deck.cards.pop();
    socket.emit("deal-cards", [newCard]);
  }

  handle_stand(socket) {
    // TODO: implement stand logic
    // 1. reveals dealer's card
    // 2. add all values of player's cards and dealer's card
    // 3. call determine_winner
  }

  determine_winner() {
    // TODO: implement winner determination logic
    // check if sum <= 21
    // if yes, winner is player
    // if no, winner is dealer
    this.io.emit("game-result", {
      winner: null,
    });
  }

  // listens on port 3000
  start_server(port) {
    this.server.listen(port, () => {
      console.log(`Dealer server running on port ${port}`);
    });
  }
}

// start the dealer
const dealer = new Dealer();
