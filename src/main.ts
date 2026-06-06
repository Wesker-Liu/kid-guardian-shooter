import Phaser from "phaser";
import "./style.css";

type EnemyKind = "drifter" | "bubble" | "shooter" | "spark";

interface GameConfig {
  durationMs: number;
  playerSpeed: number;
  missileCooldownMs: number;
  cannonCooldownMs: number;
  maxLocks: number;
  saberRadius: number;
  shieldRadius: number;
}

interface ScoreState {
  score: number;
  hits: number;
  missilesFired: number;
  cannonHits: number;
  shieldBlocks: number;
  saberSaves: number;
  combo: number;
  bestCombo: number;
}

interface EnemyData {
  kind: EnemyKind;
  value: number;
  canShoot: boolean;
  shootCooldown: number;
  waveOffset: number;
  speed: number;
}

const GAME_CONFIG: GameConfig = {
  durationMs: 180_000,
  playerSpeed: 360,
  missileCooldownMs: 720,
  cannonCooldownMs: 120,
  maxLocks: 6,
  saberRadius: 92,
  shieldRadius: 74
};

const GAME_WIDTH = 900;
const GAME_HEIGHT = 1100;

class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyMissiles!: Phaser.Input.Keyboard.Key;
  private keyCannon!: Phaser.Input.Keyboard.Key;
  private player!: Phaser.Physics.Arcade.Image;
  private playerGlow!: Phaser.GameObjects.Image;
  private barrierGraphics!: Phaser.GameObjects.Graphics;
  private enemies!: Phaser.Physics.Arcade.Group;
  private missiles!: Phaser.Physics.Arcade.Group;
  private cannonShots!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private lockGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private lockedEnemies: Phaser.Physics.Arcade.Image[] = [];
  private scoreState: ScoreState = {
    score: 0,
    hits: 0,
    missilesFired: 0,
    cannonHits: 0,
    shieldBlocks: 0,
    saberSaves: 0,
    combo: 0,
    bestCombo: 0
  };
  private elapsedMs = 0;
  private nextEnemyAt = 0;
  private lastMissileAt = -9999;
  private lastCannonAt = -9999;
  private bulletBarrierAlpha = 0;
  private bulletBarrierScale = 1;
  private proximityBarrierAlpha = 0;
  private proximityBarrierScale = 1;
  private isEnded = false;

  constructor() {
    super("GameScene");
  }

  preload() {
    this.createTextures();
  }

  create() {
    this.cameras.main.setBackgroundColor("#152238");
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.addFlowingGalaxy();

    this.enemies = this.physics.add.group();
    this.missiles = this.physics.add.group();
    this.cannonShots = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    this.player = this.physics.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 160, "playerShip");
    this.player.setCircle(32, 16, 20);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(20);

    this.playerGlow = this.add.image(this.player.x, this.player.y, "playerGlow");
    this.playerGlow.setDepth(18);
    this.playerGlow.setAlpha(0.7);

    this.barrierGraphics = this.add.graphics();
    this.barrierGraphics.setDepth(23);

    this.lockGraphics = this.add.graphics();
    this.lockGraphics.setDepth(30);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyCannon = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyMissiles = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);

    this.hudText = this.add.text(24, 20, "", {
      fontFamily: "Arial",
      fontSize: "26px",
      color: "#f9fbff",
      stroke: "#101827",
      strokeThickness: 5
    });
    this.hudText.setDepth(50);

    this.statusText = this.add.text(GAME_WIDTH / 2, 84, "方向鍵移動  A 機砲  S 飛彈", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#ffe28a",
      stroke: "#101827",
      strokeThickness: 5
    });
    this.statusText.setOrigin(0.5);
    this.statusText.setDepth(50);

    this.physics.add.overlap(
      this.missiles,
      this.enemies,
      (missile, enemy) => this.onMissileHit(missile, enemy),
      undefined,
      this
    );
    this.physics.add.overlap(
      this.cannonShots,
      this.enemies,
      (shot, enemy) => this.onCannonHit(shot, enemy),
      undefined,
      this
    );

    this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        if (!this.isEnded) {
          this.showStatus("自動鎖定已更新");
        }
      }
    });
  }

  update(time: number, delta: number) {
    if (this.isEnded) {
      return;
    }

    this.elapsedMs += delta;
    if (this.elapsedMs >= GAME_CONFIG.durationMs) {
      this.endGame();
      return;
    }

    this.movePlayer(delta);
    this.updatePlayerEffects(time, delta);
    this.spawnEnemies(time);
    this.updateEnemies(delta, time);
    this.updateProjectiles(delta);
    this.updateTargeting();
    this.drawTargetLocks(time);
    this.handleWeapons(time);
    this.handleSaber();
    this.handleShield();
    this.updateHud();
  }

  private createTextures() {
    this.makePlayerTexture();
    this.makeEnemyTexture("enemy_drifter", 0xffc857, 0xff6b6b);
    this.makeEnemyTexture("enemy_bubble", 0x8ce6ff, 0x5f74ff);
    this.makeEnemyTexture("enemy_shooter", 0xff8bd1, 0xa66cff);
    this.makeEnemyTexture("enemy_spark", 0xb7ff55, 0x2ee6a6);
    this.makeCircleTexture("missile", 0xfff4a3, 18, 0xff8f3d);
    this.makeCircleTexture("cannon", 0x7df7ff, 9, 0xffffff);
    this.makeCircleTexture("enemyBullet", 0xffb1d8, 12, 0xffffff);
    this.makeCircleTexture("starParticle", 0xffeb75, 8, 0xffffff);
    this.makeGlowTexture();
  }

  private makePlayerTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x8be9fd, 1);
    g.fillRoundedRect(28, 8, 40, 82, 20);
    g.fillStyle(0xffe66d, 1);
    g.fillTriangle(48, 0, 24, 38, 72, 38);
    g.fillStyle(0xff6bcb, 1);
    g.fillTriangle(30, 50, 0, 82, 36, 76);
    g.fillTriangle(66, 50, 96, 82, 60, 76);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(48, 34, 24, 20);
    g.fillStyle(0x5f74ff, 1);
    g.fillCircle(48, 36, 7);
    g.generateTexture("playerShip", 96, 104);
    g.destroy();
  }

  private makeEnemyTexture(key: string, colorA: number, colorB: number) {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(colorA, 1);
    g.fillRoundedRect(8, 12, 56, 44, 20);
    g.fillStyle(colorB, 1);
    g.fillCircle(20, 34, 13);
    g.fillCircle(52, 34, 13);
    g.fillStyle(0xffffff, 0.92);
    g.fillCircle(36, 25, 8);
    g.fillStyle(0x20344f, 1);
    g.fillCircle(36, 25, 3);
    g.generateTexture(key, 72, 68);
    g.destroy();
  }

  private makeCircleTexture(key: string, color: number, radius: number, core: number) {
    const size = radius * 2 + 8;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(color, 0.35);
    g.fillCircle(size / 2, size / 2, radius + 3);
    g.fillStyle(color, 1);
    g.fillCircle(size / 2, size / 2, radius);
    g.fillStyle(core, 0.9);
    g.fillCircle(size / 2, size / 2, Math.max(3, radius * 0.38));
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeGlowTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x76f7ff, 0.12);
    g.fillCircle(80, 80, 78);
    g.fillStyle(0xb7ff55, 0.1);
    g.fillCircle(80, 80, 52);
    g.generateTexture("playerGlow", 160, 160);
    g.destroy();
  }

  private addFlowingGalaxy() {
    const nebulaColors = [0x5f74ff, 0xff6bcb, 0x76f7ff, 0xb7ff55];
    for (let i = 0; i < 8; i += 1) {
      const nebula = this.add.ellipse(
        Phaser.Math.Between(80, GAME_WIDTH - 80),
        Phaser.Math.Between(-GAME_HEIGHT, GAME_HEIGHT),
        Phaser.Math.Between(460, 880),
        Phaser.Math.Between(62, 130),
        Phaser.Utils.Array.GetRandom(nebulaColors),
        Phaser.Math.FloatBetween(0.035, 0.075)
      );
      nebula.setRotation(Phaser.Math.FloatBetween(-0.75, 0.75));
      nebula.setBlendMode(Phaser.BlendModes.ADD);
      nebula.setDepth(0);
      nebula.setData("backgroundFlow", {
        speed: Phaser.Math.FloatBetween(18, 38),
        baseX: nebula.x,
        drift: Phaser.Math.FloatBetween(30, 90),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        spin: Phaser.Math.FloatBetween(-0.08, 0.08),
        resetPad: 260
      });
    }

    for (let i = 0; i < 150; i += 1) {
      const x = Phaser.Math.Between(10, GAME_WIDTH - 10);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const size = Phaser.Math.FloatBetween(1, 3.5);
      const color = Phaser.Utils.Array.GetRandom([0xffffff, 0xffe28a, 0x86f7ff, 0xffa9d6]);
      const star = this.add.circle(x, y, size, color, Phaser.Math.FloatBetween(0.25, 0.7));
      star.setData("backgroundFlow", {
        speed: Phaser.Math.FloatBetween(34, 115),
        baseX: star.x,
        drift: Phaser.Math.FloatBetween(4, 28),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        spin: 0,
        resetPad: 10
      });
      star.setDepth(1);
    }

    for (let i = 0; i < 34; i += 1) {
      const streak = this.add.rectangle(
        Phaser.Math.Between(20, GAME_WIDTH - 20),
        Phaser.Math.Between(0, GAME_HEIGHT),
        Phaser.Math.FloatBetween(1.2, 2.6),
        Phaser.Math.FloatBetween(18, 46),
        0xdaf8ff,
        Phaser.Math.FloatBetween(0.12, 0.28)
      );
      streak.setRotation(Phaser.Math.FloatBetween(-0.12, 0.12));
      streak.setDepth(1);
      streak.setData("backgroundFlow", {
        speed: Phaser.Math.FloatBetween(150, 245),
        baseX: streak.x,
        drift: Phaser.Math.FloatBetween(2, 12),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        spin: Phaser.Math.FloatBetween(-0.02, 0.02),
        resetPad: 50
      });
    }
  }

  private movePlayer(delta: number) {
    const velocity = new Phaser.Math.Vector2(0, 0);
    if (this.cursors.left?.isDown) velocity.x -= 1;
    if (this.cursors.right?.isDown) velocity.x += 1;
    if (this.cursors.up?.isDown) velocity.y -= 1;
    if (this.cursors.down?.isDown) velocity.y += 1;
    velocity.normalize().scale(GAME_CONFIG.playerSpeed);
    this.player.setVelocity(velocity.x, velocity.y);
    this.player.setRotation(Phaser.Math.Clamp(velocity.x / 800, -0.28, 0.28));
    this.playerGlow.setPosition(this.player.x, this.player.y + 4);
  }

  private updatePlayerEffects(time: number, delta: number) {
    this.playerGlow.setScale(1 + Math.sin(time / 180) * 0.04);
    this.bulletBarrierAlpha = Math.max(0, this.bulletBarrierAlpha - delta / 360);
    this.proximityBarrierAlpha = Math.max(0, this.proximityBarrierAlpha - delta / 310);
    this.bulletBarrierScale += delta / 1800;
    this.proximityBarrierScale += delta / 1600;
    this.drawBarrierEffects();
  }

  private spawnEnemies(time: number) {
    if (time < this.nextEnemyAt) {
      return;
    }

    const phase = this.elapsedMs / GAME_CONFIG.durationMs;
    const count = phase > 0.75 ? Phaser.Math.Between(2, 4) : phase > 0.34 ? Phaser.Math.Between(1, 3) : 1;

    for (let i = 0; i < count; i += 1) {
      this.createEnemy(phase);
    }

    const delay = phase > 0.75 ? 520 : phase > 0.34 ? 780 : 1050;
    this.nextEnemyAt = time + delay;
  }

  private createEnemy(phase: number) {
    const roll = Math.random();
    const kind: EnemyKind =
      phase > 0.74 && roll > 0.66
        ? "spark"
        : phase > 0.34 && roll > 0.58
          ? "shooter"
          : roll > 0.45
            ? "bubble"
            : "drifter";
    const key = `enemy_${kind}`;
    const enemy = this.physics.add.image(Phaser.Math.Between(70, GAME_WIDTH - 70), -70, key);
    enemy.setDepth(12);
    enemy.setCircle(28, 8, 7);
    enemy.setData("enemy", {
      kind,
      value: kind === "spark" ? 180 : kind === "shooter" ? 150 : 100,
      canShoot: kind === "shooter" || kind === "spark",
      shootCooldown: Phaser.Math.Between(850, 1600),
      waveOffset: Phaser.Math.FloatBetween(0, Math.PI * 2),
      speed: kind === "spark" ? 156 : kind === "shooter" ? 118 : Phaser.Math.Between(78, 110)
    } satisfies EnemyData);
    this.enemies.add(enemy);
  }

  private updateEnemies(delta: number, time: number) {
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      const data = enemy.getData("enemy") as EnemyData;
      const wave = Math.sin(time / 420 + data.waveOffset) * (data.kind === "bubble" ? 60 : 28);
      enemy.setVelocity(wave, data.speed);
      enemy.setRotation(Math.sin(time / 300 + data.waveOffset) * 0.16);

      if (data.canShoot) {
        data.shootCooldown -= delta;
        if (data.shootCooldown <= 0 && enemy.y > 80 && enemy.y < GAME_HEIGHT - 260) {
          this.fireEnemyBullet(enemy);
          data.shootCooldown = Phaser.Math.Between(1250, 2200);
        }
      }

      if (enemy.y > GAME_HEIGHT + 90) {
        enemy.destroy();
        this.breakCombo();
      }
      return true;
    });
  }

  private updateProjectiles(delta: number) {
    this.children.list.forEach((child) => {
      const flow = child.getData("backgroundFlow") as
        | { speed: number; baseX: number; drift: number; phase: number; spin: number; resetPad: number }
        | undefined;

      if (flow) {
        const flowObject = child as unknown as { x: number; y: number; rotation: number };
        flowObject.y += flow.speed * (delta / 1000);
        flowObject.x = flow.baseX + Math.sin(this.elapsedMs / 900 + flow.phase) * flow.drift;
        flowObject.rotation += flow.spin * (delta / 1000);

        if (flowObject.y > GAME_HEIGHT + flow.resetPad) {
          flowObject.y = -flow.resetPad;
          flow.baseX = Phaser.Math.Between(20, GAME_WIDTH - 20);
          flow.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
        }
      }
    });

    this.missiles.children.each((child) => {
      const missile = child as Phaser.Physics.Arcade.Image;
      const target = missile.getData("target") as Phaser.Physics.Arcade.Image | undefined;
      if (target?.active) {
        this.physics.moveToObject(missile, target, 550);
        missile.rotation = Phaser.Math.Angle.Between(missile.x, missile.y, target.x, target.y) + Math.PI / 2;
      }
      if (missile.y < -60 || missile.y > GAME_HEIGHT + 80 || missile.x < -80 || missile.x > GAME_WIDTH + 80) {
        missile.destroy();
      }
      return true;
    });

    this.cannonShots.children.each((child) => {
      const shot = child as Phaser.Physics.Arcade.Image;
      if (shot.y < -40) shot.destroy();
      return true;
    });

    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (bullet.body && Math.abs(bullet.body.velocity.y) < 1) {
        bullet.setVelocityY(260);
      }
      if (bullet.y > GAME_HEIGHT + 50 || bullet.x < -60 || bullet.x > GAME_WIDTH + 60) bullet.destroy();
      return true;
    });
  }

  private drawBarrierEffects() {
    this.barrierGraphics.clear();

    if (this.proximityBarrierAlpha > 0) {
      this.drawDodecagonBarrier(
        this.player.x,
        this.player.y,
        GAME_CONFIG.saberRadius,
        this.proximityBarrierScale,
        this.proximityBarrierAlpha,
        0xb7ff55,
        0x75f7b1
      );
    }

    if (this.bulletBarrierAlpha > 0) {
      this.drawDodecagonBarrier(
        this.player.x,
        this.player.y,
        GAME_CONFIG.shieldRadius,
        this.bulletBarrierScale,
        this.bulletBarrierAlpha,
        0x76dfff,
        0xdaf8ff
      );
    }
  }

  private drawDodecagonBarrier(
    x: number,
    y: number,
    radius: number,
    scale: number,
    alpha: number,
    fillColor: number,
    strokeColor: number
  ) {
    const points = [];
    const scaledRadius = radius * scale;

    for (let i = 0; i < 12; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / 12;
      points.push({
        x: x + Math.cos(angle) * scaledRadius,
        y: y + Math.sin(angle) * scaledRadius
      });
    }

    this.barrierGraphics.fillStyle(fillColor, 0.16 * alpha);
    this.barrierGraphics.lineStyle(5, strokeColor, 0.7 * alpha);
    this.barrierGraphics.beginPath();
    this.barrierGraphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      this.barrierGraphics.lineTo(points[i].x, points[i].y);
    }
    this.barrierGraphics.closePath();
    this.barrierGraphics.fillPath();
    this.barrierGraphics.strokePath();

    this.barrierGraphics.lineStyle(2, 0xffffff, 0.36 * alpha);
    this.barrierGraphics.strokePath();
  }

  private updateTargeting() {
    const candidates = this.enemies
      .getChildren()
      .map((child) => child as Phaser.Physics.Arcade.Image)
      .filter((enemy) => enemy.active && enemy.y > 20 && enemy.y < GAME_HEIGHT - 130)
      .sort((a, b) => {
        const da = Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y);
        const db = Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y);
        return da - db || a.y - b.y;
      });
    this.lockedEnemies = candidates.slice(0, GAME_CONFIG.maxLocks);
  }

  private drawTargetLocks(time: number) {
    this.lockGraphics.clear();
    this.lockedEnemies.forEach((enemy, index) => {
      const pulse = 1 + Math.sin(time / 120 + index) * 0.08;
      const radius = 42 * pulse;
      const color = Phaser.Display.Color.GetColor(255, 230 - index * 12, 105 + index * 20);
      this.lockGraphics.lineStyle(3, color, 0.9);
      this.lockGraphics.strokeCircle(enemy.x, enemy.y, radius);
      this.lockGraphics.lineStyle(2, 0xffffff, 0.45);
      this.lockGraphics.strokeCircle(enemy.x, enemy.y, radius + 8);
    });
  }

  private handleWeapons(time: number) {
    if (Phaser.Input.Keyboard.JustDown(this.keyMissiles) && time - this.lastMissileAt >= GAME_CONFIG.missileCooldownMs) {
      this.fireMissiles(time);
    }

    if (this.keyCannon.isDown && time - this.lastCannonAt >= GAME_CONFIG.cannonCooldownMs) {
      this.fireCannon(time);
    }
  }

  private fireMissiles(time: number) {
    if (this.lockedEnemies.length === 0) {
      this.showStatus("沒有目標，先靠近敵人");
      return;
    }

    this.lastMissileAt = time;
    this.lockedEnemies.forEach((enemy, index) => {
      const missile = this.physics.add.image(this.player.x + (index - 2.5) * 16, this.player.y - 48, "missile");
      missile.setDepth(16);
      missile.setData("target", enemy);
      missile.setCircle(13);
      this.physics.moveToObject(missile, enemy, 550);
      this.missiles.add(missile);
      this.scoreState.missilesFired += 1;
    });
    this.showStatus(`飛彈齊射 x${this.lockedEnemies.length}`);
  }

  private fireCannon(time: number) {
    this.lastCannonAt = time;
    const shot = this.physics.add.image(this.player.x, this.player.y - 72, "cannon");
    shot.setDepth(15);
    shot.setRotation(0);
    shot.setVelocityY(-760);
    shot.setCircle(8);
    this.cannonShots.add(shot);
  }

  private fireEnemyBullet(enemy: Phaser.Physics.Arcade.Image) {
    const bullet = this.physics.add.image(enemy.x, enemy.y + 30, "enemyBullet");
    bullet.setDepth(11);
    bullet.setCircle(10);
    bullet.setVelocity(0, 260);
    this.enemyBullets.add(bullet);
  }

  private handleSaber() {
    let activated = false;
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (distance <= GAME_CONFIG.saberRadius) {
        this.destroyEnemy(enemy, "saber");
        activated = true;
      }
      return true;
    });

    if (activated) {
      this.proximityBarrierAlpha = 1;
      this.proximityBarrierScale = 0.92;
      this.showStatus("12邊形防護罩清除近身敵人");
    }
  }

  private handleShield() {
    let blocked = false;
    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, bullet.x, bullet.y);
      if (distance <= GAME_CONFIG.shieldRadius) {
        bullet.destroy();
        blocked = true;
        this.scoreState.shieldBlocks += 1;
        this.scoreState.score += 25 + this.scoreState.combo * 2;
        this.spawnSparkles(this.player.x, this.player.y, 0x76dfff, 8);
      }
      return true;
    });

    if (blocked) {
      this.bulletBarrierAlpha = 1;
      this.bulletBarrierScale = 0.92;
      this.showStatus("12邊形防護罩擋住砲彈");
    }
  }

  private onMissileHit(
    missileObject: unknown,
    enemyObject: unknown
  ) {
    (missileObject as Phaser.GameObjects.GameObject).destroy();
    this.destroyEnemy(enemyObject as Phaser.Physics.Arcade.Image, "missile");
  }

  private onCannonHit(
    shotObject: unknown,
    enemyObject: unknown
  ) {
    (shotObject as Phaser.GameObjects.GameObject).destroy();
    this.scoreState.cannonHits += 1;
    this.destroyEnemy(enemyObject as Phaser.Physics.Arcade.Image, "cannon");
  }

  private destroyEnemy(enemy: Phaser.Physics.Arcade.Image, source: "missile" | "cannon" | "saber") {
    if (!enemy.active) {
      return;
    }

    const data = enemy.getData("enemy") as EnemyData;
    this.scoreState.hits += 1;
    this.scoreState.combo += 1;
    this.scoreState.bestCombo = Math.max(this.scoreState.bestCombo, this.scoreState.combo);

    if (source === "saber") {
      this.scoreState.saberSaves += 1;
    }

    const bonus = source === "missile" ? 30 : source === "saber" ? 45 : 20;
    this.scoreState.score += data.value + bonus + this.scoreState.combo * 6;
    this.spawnSparkles(enemy.x, enemy.y, source === "saber" ? 0xb7ff55 : 0xffe66d, 14);
    enemy.destroy();
  }

  private spawnSparkles(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i += 1) {
      const sparkle = this.add.image(x, y, "starParticle");
      sparkle.setTint(color);
      sparkle.setDepth(28);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(24, 96);
      this.tweens.add({
        targets: sparkle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: Phaser.Math.FloatBetween(0.5, 1.8),
        duration: Phaser.Math.Between(360, 680),
        ease: "Cubic.easeOut",
        onComplete: () => sparkle.destroy()
      });
    }
  }

  private breakCombo() {
    this.scoreState.combo = 0;
  }

  private showStatus(message: string) {
    this.statusText.setText(message);
    this.statusText.setAlpha(1);
    this.tweens.killTweensOf(this.statusText);
    this.tweens.add({ targets: this.statusText, alpha: 0.55, duration: 800 });
  }

  private updateHud() {
    const remaining = Math.max(0, GAME_CONFIG.durationMs - this.elapsedMs);
    const minutes = Math.floor(remaining / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000)
      .toString()
      .padStart(2, "0");
    this.hudText.setText(
      `時間 ${minutes}:${seconds}\n分數 ${this.scoreState.score}\n連段 ${this.scoreState.combo}  鎖定 ${this.lockedEnemies.length}`
    );
  }

  private endGame() {
    this.isEnded = true;
    this.physics.pause();
    this.lockGraphics.clear();
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x101827, 0.78).setDepth(80);

    const medals = this.getMedals();
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 650, 620, 0xf9fbff, 0.95);
    panel.setStrokeStyle(8, 0x75f7b1, 1);
    panel.setDepth(81);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 240, "任務完成！", {
        fontFamily: "Arial",
        fontSize: "58px",
        color: "#20344f",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(82);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 150, `總分 ${this.scoreState.score}`, {
        fontFamily: "Arial",
        fontSize: "42px",
        color: "#5f44b8",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(82);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 58, medals.join("\n"), {
        fontFamily: "Arial",
        fontSize: "34px",
        color: "#20344f",
        align: "center",
        lineSpacing: 12
      })
      .setOrigin(0.5)
      .setDepth(82);

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 + 142,
        `擊中 ${this.scoreState.hits}  最佳連段 ${this.scoreState.bestCombo}\n防護罩擋彈 ${this.scoreState.shieldBlocks}  近身防護 ${this.scoreState.saberSaves}`,
        {
          fontFamily: "Arial",
          fontSize: "26px",
          color: "#38506f",
          align: "center",
          lineSpacing: 10
        }
      )
      .setOrigin(0.5)
      .setDepth(82);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 255, "按 R 再玩一次", {
        fontFamily: "Arial",
        fontSize: "28px",
        color: "#0c9f87",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setDepth(82);

    this.input.keyboard!.once("keydown-R", () => this.scene.restart());
  }

  private getMedals() {
    const medals = ["星星獎章：完成三分鐘守護任務"];
    if (this.scoreState.shieldBlocks >= 4) {
      medals.push("守護者獎章：12邊形防護罩很可靠");
    }
    if (this.scoreState.hits >= 45 || this.scoreState.bestCombo >= 18) {
      medals.push("神射手獎章：鎖定飛彈超準");
    }
    if (this.scoreState.saberSaves >= 3) {
      medals.push("近身守護獎章：防護罩保護成功");
    }
    return medals;
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#152238",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scene: GameScene
};

new Phaser.Game(config);
