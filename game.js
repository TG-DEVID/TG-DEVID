// =========================================================
// Dots & Boxes Game Core Engine
// =========================================================

class DotsGame {
  constructor(options = {}) {
    this.gridSize = options.gridSize || 4;
    this.mode = options.mode || 'pve';
    this.difficulty = options.difficulty || 'medium';

    this.onStateChange = options.onStateChange || (() => {});
    this.onMoveMade = options.onMoveMade || (() => {});
    this.onBoxClaimed = options.onBoxClaimed || (() => {});
    this.onGameOver = options.onGameOver || (() => {});

    this.ai = new DotsAI(this);
    this.history = [];
    this.reset();
  }

  reset() {
    this.turn = 1;
    this.scores = { 1: 0, 2: 0 };
    this.currentCombo = 0;
    this.maxCombo = 0;
    this.totalMoves = 0;
    this.startTime = Date.now();
    this.endTime = null;
    this.isOver = false;
    this.winner = null;
    this.history = [];

    this.edges = {};
    this.boxes = {};
    this.edgeToBoxes = {};

    this.buildBoard();
  }

  buildBoard() {
    const N = this.gridSize;

    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N - 1; c++) {
        const boxKey = `${r}_${c}`;
        const top = `h_${r}_${c}`;
        const bottom = `h_${r + 1}_${c}`;
        const left = `v_${r}_${c}`;
        const right = `v_${r}_${c + 1}`;

        this.boxes[boxKey] = {
          key: boxKey,
          row: r,
          col: c,
          count: 0,
          owner: null,
          edges: [top, bottom, left, right]
        };

        [top, bottom, left, right].forEach(edgeId => {
          if (!this.edgeToBoxes[edgeId]) {
            this.edgeToBoxes[edgeId] = [];
          }
          this.edgeToBoxes[edgeId].push(boxKey);
        });
      }
    }
  }

  getTotalBoxesCount() {
    const side = this.gridSize - 1;
    return side * side;
  }

  getRemainingBoxesCount() {
    return this.getTotalBoxesCount() - (this.scores[1] + this.scores[2]);
  }

  getAvailableEdges() {
    const N = this.gridSize;
    const available = [];

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N - 1; c++) {
        const id = `h_${r}_${c}`;
        if (!this.edges[id]) available.push(id);
      }
    }

    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N; c++) {
        const id = `v_${r}_${c}`;
        if (!this.edges[id]) available.push(id);
      }
    }

    return available;
  }

  makeMove(edgeId) {
    if (this.isOver || this.edges[edgeId]) {
      return { success: false };
    }

    const currentPlayer = this.turn;

    const snapshot = {
      edgeId,
      player: currentPlayer,
      prevTurn: currentPlayer,
      prevCombo: this.currentCombo,
      claimedBoxes: []
    };

    this.edges[edgeId] = { player: currentPlayer };
    this.totalMoves++;

    const affectedBoxes = this.edgeToBoxes[edgeId] || [];
    const newlyClaimed = [];

    for (const boxKey of affectedBoxes) {
      const box = this.boxes[boxKey];
      box.count++;
      if (box.count === 4 && !box.owner) {
        box.owner = currentPlayer;
        this.scores[currentPlayer]++;
        newlyClaimed.push(box);
        snapshot.claimedBoxes.push(boxKey);
      }
    }

    let extraTurn = false;
    if (newlyClaimed.length > 0) {
      extraTurn = true;
      this.currentCombo += newlyClaimed.length;
      if (this.currentCombo > this.maxCombo) {
        this.maxCombo = this.currentCombo;
      }

      newlyClaimed.forEach(box => {
        this.onBoxClaimed({
          box,
          player: currentPlayer,
          combo: this.currentCombo
        });
      });
    } else {
      this.currentCombo = 0;
      this.turn = this.turn === 1 ? 2 : 1;
    }

    this.history.push(snapshot);

    const totalBoxes = this.getTotalBoxesCount();
    if (this.scores[1] + this.scores[2] === totalBoxes) {
      this.isOver = true;
      this.endTime = Date.now();
      if (this.scores[1] > this.scores[2]) {
        this.winner = 1;
      } else if (this.scores[2] > this.scores[1]) {
        this.winner = 2;
      } else {
        this.winner = 'draw';
      }
      this.recordGameStats();
      this.onGameOver({
        winner: this.winner,
        scores: { ...this.scores },
        totalMoves: this.totalMoves,
        maxCombo: this.maxCombo,
        duration: Math.round((this.endTime - this.startTime) / 1000)
      });
    }

    this.onMoveMade({
      edgeId,
      player: currentPlayer,
      extraTurn,
      claimedBoxes: newlyClaimed,
      nextTurn: this.turn,
      isOver: this.isOver
    });

    return {
      success: true,
      edgeId,
      player: currentPlayer,
      extraTurn,
      claimedBoxes: newlyClaimed,
      isOver: this.isOver
    };
  }

  undo() {
    if (this.history.length === 0 || this.isOver) return false;

    if (this.mode === 'pve' && this.turn === 1 && this.history.length >= 2) {
      this.revertSingleMove();
      this.revertSingleMove();
      return true;
    }

    return this.revertSingleMove();
  }

  revertSingleMove() {
    if (this.history.length === 0) return false;
    const last = this.history.pop();

    delete this.edges[last.edgeId];
    this.totalMoves--;

    for (const boxKey of last.claimedBoxes) {
      const box = this.boxes[boxKey];
      box.owner = null;
      box.count = 3;
      this.scores[last.player]--;
    }

    const affected = this.edgeToBoxes[last.edgeId] || [];
    for (const boxKey of affected) {
      if (!last.claimedBoxes.includes(boxKey)) {
        this.boxes[boxKey].count--;
      }
    }

    this.turn = last.prevTurn;
    this.currentCombo = last.prevCombo;
    this.isOver = false;
    this.winner = null;

    return true;
  }

  recordGameStats() {
    try {
      const stats = JSON.parse(localStorage.getItem('dots_stats') || '{}');
      stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
      if (this.winner === 1) {
        stats.p1Wins = (stats.p1Wins || 0) + 1;
      }
      stats.boxesCaptured = (stats.boxesCaptured || 0) + this.scores[1];
      stats.bestCombo = Math.max(stats.bestCombo || 0, this.maxCombo);
      localStorage.setItem('dots_stats', JSON.stringify(stats));
    } catch (e) {}
  }
}
