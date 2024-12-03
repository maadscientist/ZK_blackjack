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
      this.io.emit("connected", {
        message: "You have connected.",
      });
      console.log("-------------------------------------");
      console.log("Player connected!");
      console.log("-------------------------------------");
      this.players.push(socket);

      // handle player actions - hit, stand
      socket.on("player-action", (action) => {
        this.process_player_action(socket, action);
      });

      // handle disconnection
      socket.on("disconnect", () => {
        this.players = this.players.filter((p) => p !== socket);
        console.log("Player disconnected!");
        console.log("-------------------------------------");
        process.exit();
      });

      socket.on("player-declare-PK", (message) => {
        // read in player's public key (elliptic curve point object)
        this.player_PK = Deck.reconstructPoint(message.publicKey);
        console.log("Received Player's PK: ", this.player_PK.getX());
        console.log("-------------------------------------");

        // initialize game when a player connects
        //Can only initialize game once we have player's public key.
        if (this.players.length >= 1 && this.player_PK != []) {
          this.initialize_game();
        }
      });

      socket.on("player-mask", (data) => {
        console.log("Player has masked.");
      });
      socket.on("player-shuffle", (data) => {
        console.log("Player has shuffled.");
        console.log("-------------------------------------");
      });

      socket.on("send-deck", (deck) => {
        console.log("Received deck and proof!");
        console.log("-------------------------------------");
        this.deck = Deck.reconstructDeck(deck);
        this.deck.verify_shuffle_proof();
        console.log("-------------------------------------");
        this.start_game(socket);
        console.log("GAME STARTED!");
      });

      socket.on("result", (data) => {
        console.log("-------------------------------------");
        if (data == 1) {
          console.log("Player won.");
        } else {
          console.log("Player lost.");
        }
        console.log("-------------------------------------");
      });
    });
  }

  initialize_game() {
    // Setup dealer's variables
    const ec = new EC("secp256k1");

    this.dealer_card = -1;
    this.player_cards = [];

    const key = ec.genKeyPair();
    this.publicKey = key.getPublic();
    this.privateKey = key.getPrivate();

    //send dealer PK
    const PK_serialized = Deck.serializePoint(this.publicKey);

    this.io.emit("dealer-declare-PK", {
      publicKey: PK_serialized,
    });

    this.cardsDrawnFromDeck = 0;

    // set up ec and public keys for deck
    const publicKeys = [this.publicKey, this.player_PK];

    // create a shuffled deck
    this.deck = new Deck(ec, publicKeys);

    // NOTE: all implementations except hits for the player are emitted as an event
    // we need to handle them in the player.js file
    // we can implement the dealer actions in this file

    // dealer masks
    this.deck.mask_cards();

    console.log("Dealer has finished masking.");
    this.io.emit("dealer-mask");

    // dealer shuffles
    this.deck.shuffle();
    console.log("Dealer has finished shuffling.");
    console.log("-------------------------------------");

    console.log("Generating proof...");
    this.deck.generate_shuffle_proof();
    console.log("-------------------------------------");
    this.io.emit("dealer-shuffle");

    // send deck to player
    console.log("Sending deck and proof to player...");
    console.log("-------------------------------------");
    this.send_deck();
  }

  /**
   * This is called once the game has been initialized and the deck has been returned by the player.
   */
  start_game(socket) {
    // broadcast game start
    this.io.emit("game-start");
    // Dealer gets first card - *don't* unmask this one
    this.dealer_card = this.cardsDrawnFromDeck; //Should be 0
    this.cardsDrawnFromDeck++;

    // Player gets the second card
    this.handle_hit(socket);
  }

  // helper for handling player actions
  process_player_action(socket, action) {
    switch (action.type) {
      case "hit":
        this.handle_hit(socket);
        console.log("Player chooses to HIT");
        break;
      case "stand":
        this.handle_stand(socket);
        console.log("Player chooses to STAND");

        break;
    }
  }

  handle_hit(socket) {
    // give player/dealer a card from the deck
    // we could also have a check - if the sum of JUST the players' cards (because we haven't revealed the dealer's card yet) is above 21, do not handle hit and declare the loss of the player

    // Both dealer and player have same copy of the deck, so just use indices to represent cards.
    // First card dealt is card 0, then 1, 2, etc...
    const newCard = this.cardsDrawnFromDeck;
    this.cardsDrawnFromDeck += 1;
    socket.emit("deal-card-player", [newCard]);

    this.player_cards.push(newCard);
    this.handle_unmask(socket, newCard);
  }

  handle_stand(socket) {
    socket.emit("reveal-dealer-card", [this.dealer_card]);
    this.handle_unmask(socket, this.dealer_card);
  }

  // listens on port 3000
  start_server(port) {
    this.server.listen(port, () => {
      console.log("-------------------------------------");
      console.log(`Dealer server running on port ${port}`);
      console.log("Waiting for player to connect...");
      console.log("-------------------------------------");
    });
  }

  send_deck() {
    // Emit deck in a way we can process
    this.io.emit("send-deck", this.deck.serializeDeck());
  }

  handle_unmask(socket, cardIndex) {
    // first - compute player's unmask key for that card index.
    const unmask_key = this.deck.get_unmask_key(cardIndex, this.privateKey);
    const unmask_key_serialized = Deck.serializePoint(unmask_key);
    this.io.emit("dealer-unmask-card", {
      cardIndex: cardIndex,
      unmaskKey: unmask_key_serialized,
    });
  }
}

// start the dealer
const dealer = new Dealer();
