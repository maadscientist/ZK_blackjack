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

      this.io.emit("Connected!", {
        message: "You have connected.",
      });
      
      console.log("Player connected");
      this.players.push(socket);


      // handle player actions - hit, stand
      socket.on("player-action", (action) => {
        this.process_player_action(socket, action);
      });

      // handle disconnection
      socket.on("disconnect", () => {
        this.players = this.players.filter((p) => p !== socket);
        console.log("Player disconnected");
      });

      //TODO: Need sockets for:

      socket.on("player-declare-PK", (PK) => {
        //Needs to: read in player's public key (elliptic curve point object)
        // initialize game when a player connects
        if (this.players.length >= 1) {
          this.initialize_game();
        }
        //Can only initialize game once we have player's public key.
        // if (this.players.length >= 1) {
        //   this.initialize_game();
        // }
      });

      socket.on("player-unmask-card", (unmaskKey) => {
        //Needs to: read in player's unmask key (is an elliptic curve point object)
        
      });

      socket.on("player-give-deck", (deck) => {
        //Needs to: read the whole deck of 52 cards
        //Each card is an elliptic-curve point 
        //If there's a nice way to do it with JSON's or something, we could just read the whole deck rather than having to read each card and rebuild the deck :p
        //Player will also need one of these but the logic can be the exact same.

        this.start_game(socket);
      });

    });
  }

  initialize_game() {

    //Setup dealer's variables
    const ec = new EC("secp256k1");

    this.dealer_card = -1;
    this.player_cards = [];

    const key = ec.genKeyPair()
    this.publicKey = key.getPublic();
    this.privateKey = key.getPrivate();

    this.cardsDrawnFromDeck = 0;

    // TODO: set up ec and public keys for deck
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
    this.deck.mask_cards();

    // TODO: p1 shuffle deck
    this.io.emit("player-shuffle", {
      message: "Player is shuffling...",
    });

    this.deck.shuffle();

    this.send_deck();
  }

  /**
   * This is called once the game has been initialized and the deck has been returned by the player.
   */
  start_game(socket){
    // broadcast game start
    this.io.emit("game-start", {
      message: "Game is starting...",
    });
    //Dealer gets first card - *don't* unmask this one
    this.dealer_card = this.cardsDrawnFromDeck; //Should be 0
    this.cardsDrawnFromDeck++;

    //Player gets the second card
    this.handle_hit(socket);


    // TODO: unmask player's card
    this.io.emit("player-unmask", {
      message: "Player reveals the card...",
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
    // give player/dealer a card from the deck
    // we could also have a check - if the sum of JUST the players' cards (because we haven't revealed the dealer's card yet) is above 21, do not handle hit and declare the loss of the player
    
    // Both dealer and player have same copy of the deck, so just use indices to represent cards.
    // First card dealt is card 0, then 1, 2, etc...
    const newCard = this.cardsDrawnFromDeck;
    this.cardsDrawnFromDeck += 1; 
    socket.emit("deal-card-player", [newCard]);
    this.player_cards.push(newCard);
      // this.dealer_cards.push(newCard);

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

  //TODO: Emit methods we need:
  send_deck(){
    //Emit deck in a way we can process
  }
  handle_unmask(socket, cardIndex){
    //first - compute player's unmask key for that card index.
    this.deck.get_unmask_key(cardIndex, this.privateKey)
    //Need a way to send unmask key (Elliptic Curve point)
  }

  /**
   * TOTAL UNMASK PROTOCOL SHOULD LOOK LIKE THIS:
   * 1. Dealer sends the index of the card to unmask, along with their unmask_key. Starts listening for Player's response.
   * 2. Player receives this and sends back index of card to unmask and their unmask key.
   * 3. Dealer receives this, now both dealer and player can just call 
   */
}

// start the dealer
const dealer = new Dealer();
