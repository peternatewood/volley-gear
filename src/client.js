function ready(fun) {
	if (document.readyState != 'loading') {
		fun();
	}
	else if (document.addEventListener) {
		document.addEventListener('DOMContentLoaded', fun);
	}
	else {
		document.attachEvent('onreadystatechange', function() {
			if (document.readyState != 'loading') {
				fun();
			}
		});
	}
}

ready(() => {
	// TODO: pass spritesheet id's as array so we can put this in its own class file
	function Canvas(canvasId) {
		this.context = document.getElementById(canvasId).getContext("2d");
		this.spritesheets = {
			"player": document.getElementById("player-sheet"),
			"tile": document.getElementById("tile-sheet"),
			"grenade": document.getElementById("grenade")
		};
	}
	Canvas.prototype.getWidth = function() {
		return this.context.canvas.width;
	};
	Canvas.prototype.getHeight = function() {
		return this.context.canvas.height;
	};
	Canvas.prototype.clear = function() {
		this.context.clearRect(0, 0, this.getWidth(), this.getHeight());
	};
	Canvas.prototype.rotate90 = function(direction) {
		var source = this.context.getImageData(0, 0, this.getWidth(), this.getHeight());
		var rotated = new ImageData(source.width, source.height);

		// Move each color value
		var x, y, newIndex;
		for (var i = 0; i < source.data.length; i += 4) {
			x = (i / 4) % source.width;
			y = parseInt((i / 4) / source.width);

			if (direction === 1) {
				// Clockwise: (x, y) => (x: width - y, y: x)
				// Why TF do I need an additional -1 to keep this in frame?!
				newIndex = 4 * ((source.width - y - 1) + source.width * x);
			}
			else if (direction === -1) {
				// Counter-clockwise: (x, y) => (x: y, y: height - x)
				newIndex = 4 * (y + source.width * (source.height - x));
			}

			for (j = 0; j < 4; j++) {
				rotated.data[newIndex + j] = source.data[i + j];
			}
		}

		this.context.putImageData(rotated, 0, 0)
	};
	Canvas.prototype.drawSprite = function(spriteName, spriteX, spriteY, x, y, w, h) {
		// Enforce integers when rendering
		this.context.drawImage(this.spritesheets[spriteName], spriteX, spriteY, w, h, parseInt(x), parseInt(y), w, h);
	};
	Canvas.prototype.drawTiles = function(spriteName, tiles, tileSize) {
		var x = 0;
		var y = 0;
		var sheetWidth = this.spritesheets[spriteName].width / tileSize; // tiles per row, not pixels

		for (var i = 0; i < tiles.length; i++) {
			var spriteX = tileSize * (tiles[i] % sheetWidth);
			var spriteY = tileSize * parseInt(tiles[i] / sheetWidth);
			this.drawSprite(spriteName, spriteX, spriteY, x, y, tileSize, tileSize);

			x += tileSize;
			if (x >= this.context.canvas.width) {
				x = 0;
				y += tileSize;
			}
		}
	};

	function SoundController(elements, soundFiles) {
		this.soundVolume = document.getElementById(elements.soundVolume);
		this.soundMute = document.getElementById(elements.soundMute);

		this.music = document.getElementById(elements.music)
		this.musicVolume = document.getElementById(elements.musicVolume);
		this.musicMute = document.getElementById(elements.musicMute);

		this.sounds = {};
		var soundNames = [];
		for (var i = 0; i < soundFiles.length; i++) {
			var key = soundFiles[i].substring(0, soundFiles[i].indexOf("."));
			soundNames.push(key);
			this.sounds[key] = new Audio(`sounds/${ soundFiles[i] }`);

			// Set initial volume and mute
			this.sounds[key].volume = this.soundVolume.value;
			this.sounds[key].muted = this.soundMute.checked;
		}

		this.soundVolume.addEventListener("input", function(event) {
			for (var i = 0; i < soundNames.length; i++) {
				this.sounds[soundNames[i]].volume = event.target.value;
			}
		}.bind(this));
		this.soundMute.addEventListener("change", function(event) {
			for (var i = 0; i < soundNames.length; i++) {
				this.sounds[soundNames[i]].muted = event.target.checked;
			}
		}.bind(this));

		this.musicVolume.addEventListener("input", function(event) {
			this.music.volume = event.target.value;
		}.bind(this));
		this.musicMute.addEventListener("change", function(event) {
			this.music.muted = event.target.checked;
		}.bind(this));

		// Set initial volume and mute
		for (var i = 0; i < soundNames.length; i++) {
			this.sounds[soundNames[i]].muted = this.soundMute.muted;
		}
		this.music.volume = this.musicVolume.value;
		this.music.muted = this.musicMute.checked;
	}
	SoundController.prototype.playSound = function(name) {
		// Be sure we always play from the start
		this.sounds[name].currentTime = 0;
		this.sounds[name].play();
	};
	SoundController.prototype.stopSound = function(name) {
		this.sounds[name].pause();
		this.sounds[name].currentTime = 0;
	};
	SoundController.prototype.playMusic = function(restart) {
		if (restart) {
			this.music.currentTime = 0;
		}
		this.music.play();
	};
	SoundController.prototype.pauseMusic = function() {
		this.music.pause();
	};
	var soundController = new SoundController({
		soundVolume: "sound-volume",
		soundMute: "sound-mute",
		music: "music-tara",
		musicVolume: "music-volume",
		musicMute: "music-mute"
	}, [ "punch.wav", "small_explosion.wav", "title.wav", "wiff.wav" ]);

	function Game(canvas, background, type) {
		this.type = type;
		this.canvas = canvas;
		this.background = background;
		this.grenade;
		this.explosions = [];
		this.players = [
			new Player(0),
			new Player(1)
		];
		this.landminesAlive = true;
		this.landmines = Game.generateLandmines();
		this.resetCountdown = 0;
		this.roundLoser; // Index of the player who lost the round

		this.gamePlaying = true;
		this.toggleReady(true);
		this.startCountdown = Game.START_DELAY;

		// const TILES = [
		// 	39,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,38,
		// 	47,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,61,46,
		// 	47,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,46
		// ];
		// this.drawBackground(TILES);

		this.spawnGrenade();
	}
	Game.MIN_X = [ 16, 264 ];
	Game.MAX_X = [ 248, 496 ];
	Game.MIN_Y = 8;
	Game.MAX_Y = 280;
	Game.RESTART_DELAY = 400;
	Game.START_DELAY = 700;
	Game.generateLandmines = function() {
		return [
			// Player 1's side
			new Landmine(Game.MIN_X[0] + 8, 104),
			new Landmine(Game.MIN_X[0] + 8, 120),
			new Landmine(Game.MIN_X[0] + 8, 136),
			new Landmine(Game.MIN_X[0] + 8, 152),
			new Landmine(Game.MIN_X[0] + 8, 168),
			new Landmine(Game.MIN_X[0] + 8, 184),
			// Player 1's side
			new Landmine(Game.MAX_X[1] - Landmine.SIZE - 8, 104),
			new Landmine(Game.MAX_X[1] - Landmine.SIZE - 8, 120),
			new Landmine(Game.MAX_X[1] - Landmine.SIZE - 8, 136),
			new Landmine(Game.MAX_X[1] - Landmine.SIZE - 8, 152),
			new Landmine(Game.MAX_X[1] - Landmine.SIZE - 8, 168),
			new Landmine(Game.MAX_X[1] - Landmine.SIZE - 8, 184)
		];
	};
	Game.prototype.reset = function() {
		this.explosions = [];

		for (var i = 0; i < this.players.length; i++) {
			this.players[i].reset();
		}

		this.landminesAlive = true;
		this.landmines = Game.generateLandmines();
		this.resetCountdown = 0;

		this.toggleReady(true);
		this.startCountdown = Game.START_DELAY;

		this.spawnGrenade();
	};
	Game.prototype.toggleReady = function(toggleOn) {
		const readyTitle = document.getElementById("ready-title");

		readyTitle.style.display = toggleOn ? "" : "none";
	};
	Game.prototype.doRectsCollide = function(ax, ay, aw, ah, bx, by, bw, bh) {
		if (ax + aw < bx) {
			return false;
		}
		if (ay + ah < by) {
			return false;
		}
		if (bx + bw < ax) {
			return false;
		}
		if (by + bh < ay) {
			return false;
		}

		return true;
	};
	Game.prototype.doesPlayerCollide = function(i, bx, by, bw, bh) {
		return this.doRectsCollide(this.players[i].x, this.players[i].y, Player.WIDTH, Player.HEIGHT, bx, by, bw, bh);
	};
	Game.prototype.spawnGrenade = function() {
		var totalLife = this.players[0].life + this.players[1].life;
		var towardPlayer = (Math.random() * totalLife) < this.players[0].life ? 0 : 1;

		// Set grenade direction for controlled RNG
		const START_ANGLES = [
			0.625 * Math.PI, 0.75 * Math.PI, 0.875 * Math.PI, 1.125 * Math.PI, 1.25 * Math.PI, 1.375 * Math.PI, // Left
			1.625 * Math.PI, 1.75 * Math.PI, 1.875 * Math.PI, 0.125 * Math.PI, 0.25 * Math.PI, 0.375 * Math.PI // Right
		]
		var halfLength = START_ANGLES.length / 2;
		var angle = START_ANGLES[parseInt(Math.random() * halfLength) + (towardPlayer * halfLength)];

		this.grenade = new Grenade(Game.MIN_X[0] + (Game.MAX_X[1] - Game.MIN_X[0]) / 2 - (Grenade.SIZE / 2), (Game.MAX_Y - Game.MIN_Y) / 2 - (Grenade.SIZE / 2));
		this.grenade.start(angle);
	};
	Game.prototype.spawnExplosion = function(x, y) {
		soundController.playSound("small_explosion");

		return new Explosion(x, y);
	};
	Game.prototype.detonateLandmines = function(landmineIndex) {
		// this.landmines[landmineIndex].explode();

		// Prime adjacent landmines to explode
		var halfLandmineCount = this.landmines.length / 2;
		var start = 0;
		if (landmineIndex < halfLandmineCount) {
			this.roundLoser = 0;
		}
		else {
			this.roundLoser = 1;
			start = halfLandmineCount;
		}

		for (var i = start; i < start + halfLandmineCount; i++) {
			var delay = Landmine.DETONATE_DELAY * Math.abs(landmineIndex - i);
			this.landmines[i].explode(delay);
		}

		this.explosions.push(this.spawnExplosion(this.landmines[landmineIndex].x + Landmine.SIZE / 2, this.landmines[landmineIndex].y + Landmine.SIZE / 2));
		this.landminesAlive = false;
		soundController.pauseMusic();
	};
	Game.prototype.startRound = function() {
		this.toggleReady(false);
		soundController.playMusic(true);
		this.grenade.moving = true;
	};
	Game.prototype.endGame = function() {
		this.gamePlaying = false;
		// TODO: render Game Over background
		var winnerName = document.getElementById("winner-name");
		winnerName.innerText = `Player ${ 1 + ((this.roundLoser + 1) % 2) }`;

		changeScene("gameover");
	};
	// TODO: pause if window lost
	Game.prototype.update = function(delta) {
		if (this.gamePlaying) {
			if (this.startCountdown !== 0) {
				this.startCountdown -= delta;

				// Just to keep grenade spinning
				this.grenade.update(delta);

				if (this.startCountdown <= 0) {
					this.startCountdown = 0;
					this.startRound();
				}
			}
			else if (this.grenade.alive && this.landminesAlive) {
				for (var i = 0; i < this.players.length; i++) {
					this.players[i].update(actionStates[i], delta);
				}

				this.grenade.update(delta);

				for (var i = 0; i < this.players.length; i++) {
					if (this.doesPlayerCollide(i, this.grenade.x, this.grenade.y, Grenade.SIZE, Grenade.SIZE)) {
						// Grenade-Player collisions
						this.explosions.push(this.spawnExplosion(this.grenade.x + (Grenade.SIZE / 2), this.grenade.y + (Grenade.SIZE / 2)));
						this.grenade.explode();
						this.roundLoser = i;
						soundController.pauseMusic();
						// TODO: blow up player?
						return;
					}
					else if (this.players[i].punching && this.players[i].isInPunchRange(this.grenade)) {
						this.grenade.rebound(this.players[i].x, this.players[i].y);
						this.players[i].punching = false; // okay to just do this?
						soundController.stopSound("wiff");
						soundController.playSound("punch");
					}
				}

				var playerIndex = 0;
				var midIndex = this.landmines.length / 2;
				// Check both players colliding before detonating
				var landminesExplode = [];
				for (var i = 0; i < this.landmines.length; i++) {
					if (i === midIndex) playerIndex++;

					if (this.doesPlayerCollide(playerIndex, this.landmines[i].x, this.landmines[i].y, Landmine.SIZE, Landmine.SIZE)) {
						// Landmine-Player collisions (only checking the player on this landmine's side of the field)
						landminesExplode.push(i);
						// Skip remaining landmines
						i += midIndex - (i % midIndex) - 1; // I think we need to -1 to counter the loop's ++?
					}
					else if (this.doRectsCollide(this.grenade.x, this.grenade.y, Grenade.SIZE, Grenade.SIZE, this.landmines[i].x, this.landmines[i].y, Landmine.SIZE, Landmine.SIZE)) {
						// Landmine-Grenade collisions
						this.grenade.explode();
						this.detonateLandmines(i);
						// Grenade hitting the landmine gets priority over a player hitting it
						return;
					}
				}

				for (var i = 0; i < landminesExplode.length; i++) {
					this.detonateLandmines(landminesExplode[i]);
				}
			}
			else {
				if (this.resetCountdown === 0) {
					if (!this.landminesAlive) {
						// Countdown landmines' delays
						for (var i = 0; i < this.landmines.length; i++) {
							if (this.landmines[i].countingDown) {
								if (!this.landmines[i].update(delta)) {
									// Queue an explosion
									this.explosions.push(this.spawnExplosion(this.landmines[i].x + Landmine.SIZE / 2, this.landmines[i].y + Landmine.SIZE / 2));
								}
							}
						}
					}

					var noExplosionsAlive = true;

					for (var i = 0; i < this.explosions.length; i++) {
						if (this.explosions[i].alive) {
							noExplosionsAlive = false;
							this.explosions[i].update(delta);

							if (!this.explosions[i].alive) {
							}
						}
					}

					if (noExplosionsAlive) {
						this.resetCountdown = Game.RESTART_DELAY;
					}
				}
				else {
					this.resetCountdown -= delta;

					if (this.resetCountdown <= 0) {
						var damage = this.landminesAlive ? Grenade.DAMAGE : Landmine.DAMAGE;
						this.players[this.roundLoser].damageLife(damage);

						if (this.players[this.roundLoser].life <= 0) {
							this.endGame();
						}
						else {
							this.reset();
						}
					}
				}
			}
		}
		else {
			for (var i = 0; i < this.players.length; i++) {
				this.players[i].update(actionStates[i], delta);
			}
		}
	};
	Game.prototype.drawBackground = function() {
		// TODO: different backgrounds
		// this.background.drawTiles("tile", tiles, 16);

		/* Old Debug background
		this.background.clear();
		this.background.context.fillStyle = "tan";
		this.background.context.fillRect(0, 0, this.background.getWidth(), this.background.getHeight());

		var middleX = this.background.getWidth() / 2;
		this.background.context.fillStyle = "brown";
		this.background.context.fillRect(middleX - 1, 0, 2, this.background.getHeight());
		*/

		var background1 = document.getElementById("background-1");
		this.background.context.drawImage(background1, 0, 0);
	};
	Game.prototype.render = function() {
		this.canvas.clear();

		if (this.gamePlaying) {
			for (var i = 0; i < this.landmines.length; i++) {
				if (this.landmines[i].alive) {
					this.landmines[i].render(this.canvas);
				}
			}

			for (var i = 0; i < this.players.length; i++) {
				this.players[i].render(this.canvas);
			}

			if (this.grenade.alive) {
				this.grenade.render(this.canvas);
			}

			for (var i = 0; i < this.explosions.length; i++) {
				if (this.explosions[i].alive) {
					this.explosions[i].render(this.canvas);
				}
			}
		}
		else {
			for (var i = 0; i < this.players.length; i++) {
				this.players[i].render(this.canvas);
			}
		}
	};

	// Spawn an explosion with the given center point
	function Explosion(x, y) {
		this.x = parseInt(x - (Explosion.SIZE / 2));
		this.y = parseInt(y - (Explosion.SIZE / 2));
		this.frame = 0;
		this.frameCountdown = Explosion.DELAY;
		this.alive = true;
		this.spriteX = 32;
		this.spriteY = 80;
		this.spriteSize = 16;
		this.offset = (Explosion.SIZE / 2) - (this.spriteSize / 2);
	}
	Explosion.SIZE = 64;
	Explosion.DELAY = 120;
	Explosion.FRAME_COUNT = 4;
	// Return whether this explosion is still going or not
	Explosion.prototype.update = function(delta) {
		this.frameCountdown -= delta;

		if (this.frameCountdown <= 0) {
			if (++this.frame === Explosion.FRAME_COUNT) {
				this.alive = false;
				return;
			}

			switch (this.frame) {
				case 1:
					this.spriteY = 0;
					this.spriteSize = 32;
					this.offset = (Explosion.SIZE / 2) - (this.spriteSize / 2);
					break;
				case 2:
					this.spriteY = 32;
					this.offset = (Explosion.SIZE / 2) - (this.spriteSize / 2);
					break;
				case 3:
					this.spriteX = 64;
					this.spriteY = 0;
					this.spriteSize = 64;
					this.offset = 0;
					break;
			}

			this.frameCountdown += Explosion.DELAY;
		}
	};
	Explosion.prototype.render = function(canvas) {
		canvas.drawSprite("tile", this.spriteX, this.spriteY, this.x + this.offset, this.y + this.offset, this.spriteSize, this.spriteSize);
	};

	function Landmine(x, y) {
		this.x = x;
		this.y = y;
		this.alive = true;
		this.countingDown = false;
		this.delay = 0;
	}
	Landmine.SIZE = 16;
	Landmine.DETONATE_DELAY = 100;
	Landmine.DAMAGE = 2;
	Landmine.prototype.reset = function() {
		this.alive = true;
	};
	Landmine.prototype.explode = function(delay) {
		if (delay === 0) {
			this.alive = false;
		}
		else {
			this.countingDown = true;
			this.delay = delay;
		}
	};
	Landmine.prototype.update = function(delta) {
		this.delay -= delta;

		if (this.delay <= 0) {
			this.countingDown = false;
			this.alive = false;

			return false;
		}

		return true;
	};
	Landmine.prototype.render = function(canvas) {
		canvas.drawSprite("tile", 48, 64, this.x, this.y, Landmine.SIZE, Landmine.SIZE);
	};

	function Grenade(x, y) {
		this.x = x;
		this.y = y;
		this.xVel = 0;
		this.yVel = 0;
		this.alive = true;
		this.moving = false;
		this.frameCountdown = Grenade.FRAME_DELAY;
		this.sourceCanvas = new Canvas("grenade");

		this.sourceCanvas.clear();
		this.sourceCanvas.drawSprite("tile", 48, 112, 0, 0, 12, 12);
	}
	Grenade.SIZE = 8;
	Grenade.SPEED = 0.2;
	Grenade.FRAME_DELAY = 280;
	Grenade.DAMAGE = 1;
	Grenade.prototype.start = function(angle) {
		this.xVel = Grenade.SPEED * Math.cos(angle);
		this.yVel = Grenade.SPEED * Math.sin(angle);
	};
	Grenade.prototype.rebound = function(playerX, playerY) {
		var x = (this.x + Grenade.SIZE / 2) - (playerX + Player.WIDTH / 2);
		var y = (this.y + Grenade.SIZE / 2) - (playerY + Player.HEIGHT / 2);
		var distance = Math.sqrt(x * x + y * y);

		this.xVel = Grenade.SPEED * (x / distance);
		this.yVel = Grenade.SPEED * (y / distance);
	};
	Grenade.prototype.explode = function() {
		this.alive = false;

		return new Explosion(this.x + (Grenade.SIZE / 2), this.y + (Grenade.SIZE / 2));
	};
	Grenade.prototype.update = function(delta) {
		if (this.moving) {
			this.x += delta * this.xVel;
			if (this.x < Game.MIN_X[0]) {
				this.x = Game.MIN_X[0];
				this.xVel *= -1;
			}
			else if (this.x >= Game.MAX_X[1] - Grenade.SIZE) {
				this.x = Game.MAX_X[1] - Grenade.SIZE;
				this.xVel *= -1;
			}

			this.y += delta * this.yVel;
			if (this.y < Game.MIN_Y) {
				this.y = Game.MIN_Y;
				this.yVel *= -1;
			}
			else if (this.y >= Game.MAX_Y - Grenade.SIZE) {
				this.y = Game.MAX_Y - Grenade.SIZE;
				this.yVel *= -1;
			}
		}

		this.frameCountdown -= delta;

		if (this.frameCountdown <= 0) {
			this.sourceCanvas.rotate90(1);

			this.frameCountdown += Grenade.FRAME_DELAY;
		}
	};
	Grenade.prototype.render = function(canvas) {
		canvas.drawSprite("grenade", 0, 0, this.x, this.y, 12, 12);
	};

	function Player(index) {
		this.index = index;
		this.x = Player.getStartX(this.index);
		this.y = Player.getStartY();
		this.xVel = 0;
		this.yVel = 0;
		// TODO: slight acceleration from 0 to full speed?
		// this.xAcc = 0;
		// this.yAcc = 0;
		this.frame = 4 + 8 * (1 - this.index);
		this.frameCountdown = 0;

		this.life = Player.MAX_LIFE;
		this.lifeBar = document.getElementById(`life-bar-inner-${ index }`);
		this.setLife(this.life);

		this.punching = false;
		this.punchCountdown = 0;
	}
	Player.MAX_LIFE = 10;
	Player.WIDTH = 18;
	Player.HEIGHT = 32;
	Player.SPRITE_COLUMNS = 8;
	Player.FRAME_DELAY = 280;
	Player.RUN_SPEED = 0.2;
	Player.PUNCH_DELAY = 800;
	Player.PUNCH_RANGE = 4;
	Player.getStartX = function(index) {
		return Game.MIN_X[index] + ((Game.MAX_X[index] - Game.MIN_X[index]) / 2) - (Player.WIDTH / 2);
	};
	Player.getStartY = function() {
		return (Game.MAX_Y / 2) - (Player.HEIGHT / 2) + 8;
	};
	Player.prototype.reset = function() {
		this.x = Player.getStartX(this.index);
		this.y = Player.getStartY();
		this.xVel = 0;
		this.yVel = 0;
		this.frame = 4 + 8 * (1 - this.index);
		this.frameCountdown = 0;

		this.punching = false;
		this.punchCountdown = 0;
	};
	Player.prototype.setLife = function(life) {
		this.life = life;
		this.lifeBar.style.left = `${ (100 * life / Player.MAX_LIFE) - 100 }%`;
	};
	Player.prototype.damageLife = function(damage) {
		this.setLife(this.life - damage);
	};
	Player.prototype.punch = function() {
		this.punching = true;
		this.punchCountdown = Player.PUNCH_DELAY;
		this.frame = 4 * parseInt(this.frame / 4) + 3;

		soundController.playSound("wiff");
	};
	Player.prototype.isInPunchRange = function(grenade) {
		var insideX = grenade.x + Grenade.SIZE > this.x && grenade.x < this.x + Player.WIDTH;
		var insideY = grenade.y + Grenade.SIZE > this.y && grenade.y < this.y + Player.HEIGHT;

		if (this.frame === 3) {
			// Up
			if (insideX) {
				var grenadeB = grenade.y + Grenade.SIZE;
				return grenadeB >= this.y - Player.PUNCH_RANGE && grenadeB <= this.y;
			}
		}
		else if (this.frame === 7) {
			// Left
			if (insideY) {
				var grenadeR = grenade.x + Grenade.SIZE;
				return grenadeR >= this.x - Player.PUNCH_RANGE && grenadeR <= this.x;
			}
		}
		else if (this.frame === 8) {
			// Down
			if (insideX) {
				var playerB = Player.y + Player.HEIGHT;
				return grenade.y >= playerB && grenade.y <= playerB + Player.PUNCH_RANGE;
			}
		}
		else if (this.frame === 15) {
			// Right
			if (insideY) {
				var playerR = Player.x + Player.WIDTH;
				return grenade.x >= playerR && grenade.x <= playerR + Player.PUNCH_RANGE;
			}
		}

		return false;
	};
	Player.prototype.update = function(actionStates, delta) {
		// Change velocity
		var xAcc = actionStates.right - actionStates.left;
		var yAcc = actionStates.down - actionStates.up;

		// Only move player if not punching
		if (!this.punching) {
			var changedDirection = false;

			var xVel = Player.RUN_SPEED * xAcc;
			if (this.xVel !== xVel) {
				this.xVel = xVel;
				changedDirection = true;
			}

			this.x += delta * this.xVel;
			if (this.x < Game.MIN_X[this.index]) {
				this.x = Game.MIN_X[this.index];
			}
			else if (this.x + Player.WIDTH > Game.MAX_X[this.index]) {
				this.x = Game.MAX_X[this.index] - Player.WIDTH;
			}

			var yVel = Player.RUN_SPEED * yAcc;
			if (this.yVel !== yVel) {
				this.yVel = yVel;
				changedDirection = true;
			}

			this.y += delta * this.yVel;
			if (this.y < Game.MIN_Y) {
				this.y = Game.MIN_Y;
			}
			else if (this.y + Player.HEIGHT > Game.MAX_Y) {
				this.y = Game.MAX_Y - Player.HEIGHT;
			}

			// Update sprite clip
			if (this.xVel !== 0 || this.yVel !== 0) {
				this.frameCountdown -= delta;

				if (this.frameCountdown <= 0 || changedDirection) {
					if (this.xVel !== 0) {
						this.frame = 5 + (((this.frame - 5) + 1) % 2) + (this.xVel > 0 ? Player.SPRITE_COLUMNS : 0);
					}
					else if (this.yVel !== 0) {
						this.frame = 1 + (((this.frame - 1) + 1) % 2) + (this.yVel > 0 ? Player.SPRITE_COLUMNS : 0);
					}

					if (changedDirection) {
						this.frameCountdown = Player.FRAME_DELAY;
					}
					else {
						this.frameCountdown += Player.FRAME_DELAY;
					}
				}
			}
			else {
				// Reset to standing
				if (this.frameCountdown !== 0) {
					this.frameCountdown -= delta;

					if (this.frameCountdown <= 0) {
						this.frameCountdown = 0;
						this.frame = 4 * parseInt(this.frame / 4);
					}
				}
			}
		}

		// Punch lasts half the countdown, the other half is a buffer to keep from spamming punch
		if (this.punchCountdown === 0 && actionStates.punch) {
			this.punch();
		}
		else if (this.punchCountdown !== 0) {
			// Update punch countdown
			this.punchCountdown -= delta;

			// Stop punching after half the countdown
			if (this.punching && this.punchCountdown <= Player.PUNCH_DELAY / 2) {
				// Change sprite clip
				this.frame = 4 * parseInt(this.frame / 4);
				this.punching = false;
			}

			if (this.punchCountdown < 0) {
				this.punchCountdown = 0;
			}
		}
	};
	Player.prototype.render = function(canvas) {
		var spriteX = (this.frame % Player.SPRITE_COLUMNS) * Player.WIDTH;
		var spriteY = parseInt(this.frame / Player.SPRITE_COLUMNS) * Player.HEIGHT;

		canvas.drawSprite("player", spriteX, spriteY, this.x, this.y, Player.WIDTH, Player.HEIGHT);
	};

	function resetTitle() {
		var titleContainer = document.getElementById("title-container");
		titleContainer.classList.remove("sliding-in", "slid-in");
	}
	function animateTitle() {
		setTimeout(() => {
			var titleContainer = document.getElementById("title-container");
			titleContainer.classList.add("sliding-in");
			soundController.playSound("title");

			titleContainer.addEventListener("animationend", () => {
				titleContainer.classList.add("slid-in");
			});
		}, 200);
	}
	animateTitle();

	var TAU = 2 * Math.PI;
	var scene = "title"; // title, lobby, pregame, game, gameover
	var LOBBY_OPTIONS = [ "join game", "create game", "vs bot" ];
	var lobbyCursor = 0;
	var gamesAvailable = false;
	var waitingForPlayer = false;
	var canvasWrapper = document.getElementById("canvas-wrapper");

	var game;

	function changeScene(newScene) {
		scene = newScene;
		canvasWrapper.className = newScene;

		switch (scene) {
			case "title":
				resetTitle();
				animateTitle();
				break;
			case "game":
				// Prepare game stuff
				startGame("canvas", "background");
				break;
		}
	}

	document.getElementById("title-container").addEventListener("click", () => {
		// changeScene("lobby");
		changeScene("game");
	});

	var KEY_MAP = {
		"r"           : "reroll",
		// Player 1 for local play
		"w": "up0",
		"s": "down0",
		"a": "left0",
		"d": "right0",
		" ": "punch0",
		// Player 2 for local play
		"ArrowUp"     : "up1",
		"ArrowDown"   : "down1",
		"ArrowLeft"   : "left1",
		"ArrowRight"  : "right1",
		"Enter"       : "punch1"
		// Either set of controls works when playing online
	};
	var actionStates = [
		{
			"up": 0,
			"down": 0,
			"left": 0,
			"right": 0,
			"punch": 0
		},
		{
			"up": 0,
			"down": 0,
			"left": 0,
			"right": 0,
			"punch": 0
		}
	];
	function assignToActionStates(action, value) {
		if (action) {
			var index = parseInt(action.slice(-1));

			if (!isNaN(index)) {
				actionStates[index][action.slice(0, -1)] = value;
			}
		}
	}
	function handleKeyDown(e) {
		if (!e.altKey && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();

			if (!e.repeat) {
				switch (scene) {
					case "title":
						// changeScene("lobby");
						changeScene("game");
						break;
					case "lobby":
						break;
					case "game":
					case "gameover":
						var action = KEY_MAP[e.key];
						assignToActionStates(action, 1);
						break;
				}
			}
		}
	}
	function handleKeyUp(e) {
		if (KEY_MAP[e.key]) {
			var action = KEY_MAP[e.key];
			assignToActionStates(action, 0);
		}
	}
	document.addEventListener("keydown", handleKeyDown);
	document.addEventListener("keyup", handleKeyUp);

	document.getElementById("rematch").addEventListener("click", function() {
		changeScene("game");
	});
	document.getElementById("new-game").addEventListener("click", function() {
		changeScene("title");
	});

	var animationFrameId;
	function startGame(canvasId, backgroundId) {
		if (animationFrameId) {
			destroyGame();
		}

		var canvas = new Canvas(canvasId);
		var background = new Canvas(backgroundId);
		var game = new Game(canvas, background, "local");
		game.drawBackground();

		var lastTimestamp = 0;

		const MAX_DELTA = 200;
		function frameStep(timestamp) {
			var delta = 0.0;

			if (lastTimestamp !== 0) {
				delta = timestamp - lastTimestamp;
				if (delta > MAX_DELTA) {
					delta = MAX_DELTA;
				}

				game.update(delta);
				game.render();
			}

			lastTimestamp = timestamp;
			// Kind of pause if window or tab focus is lost
			if (!frameStart) {
				var frameStart = timestamp
			}
			if (timestamp - frameStart < 2000) {
				animationFrameId = window.requestAnimationFrame(frameStep);
			}
		}
		animationFrameId = window.requestAnimationFrame(frameStep);
	}
	function destroyGame() {
		window.cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
});
