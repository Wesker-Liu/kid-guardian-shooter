import Phaser from "phaser";
import "./style.css";

type EnemyKind = "drifter" | "bubble" | "shooter" | "spark";
type GameMode = "account" | "levelSelect" | "shop" | "play" | "result";
type EquipmentKind = "ship" | "laser" | "barrier";

interface GameConfig {
  durationMs: number;
  bossSpawnMs: number;
  playerSpeed: number;
  missileCooldownMs: number;
  laserCooldownMs: number;
  maxLocks: number;
  barrierRadius: number;
  enemyHp: number;
  bossHp: number;
  weaponDamage: number;
}

interface ScoreState {
  score: number;
  hits: number;
  missilesFired: number;
  laserHits: number;
  shieldBlocks: number;
  bossWeakpointHits: number;
  coinsEarned: number;
  combo: number;
  bestCombo: number;
  bossDefeated: boolean;
}

interface EnemyData {
  kind: EnemyKind;
  value: number;
  hp: number;
  canShoot: boolean;
  shootCooldown: number;
  waveOffset: number;
  speed: number;
}

interface AccountData {
  name: string;
  coins: number;
  unlockedLevel: number;
  owned: Record<EquipmentKind, string[]>;
  equipped: Record<EquipmentKind, string>;
}

interface EquipmentOption {
  id: string;
  label: string;
  cost: number;
  color: number;
}

interface BossDef {
  level: number;
  name: string;
  subtitle: string;
  texture: string;
  tint: number;
  weakpoints: Phaser.Math.Vector2[];
  behavior: "bubble" | "block" | "rainbow" | "wormhole" | "robot";
}

interface BossState {
  def: BossDef;
  sprite: Phaser.Physics.Arcade.Image;
  hp: number;
  maxHp: number;
  weakpointHp: number;
  nextShotAt: number;
  nextSummonAt: number;
  phase: number;
}

const GAME_CONFIG: GameConfig = {
  durationMs: 180_000,
  bossSpawnMs: 70_000,
  playerSpeed: 360,
  missileCooldownMs: 720,
  laserCooldownMs: 120,
  maxLocks: 6,
  barrierRadius: 82,
  enemyHp: 10,
  bossHp: 1500,
  weaponDamage: 10
};

const GAME_WIDTH = 900;
const GAME_HEIGHT = 1100;
const STORAGE_KEY = "kidGuardianShooter.accounts.v1";
const ACTIVE_ACCOUNT_KEY = "kidGuardianShooter.activeAccount.v1";

const EQUIPMENT: Record<EquipmentKind, EquipmentOption[]> = {
  ship: [
    { id: "sky", label: "天空藍", cost: 0, color: 0x8be9fd },
    { id: "candy", label: "糖果粉", cost: 25, color: 0xff6bcb },
    { id: "lime", label: "星光綠", cost: 50, color: 0xb7ff55 },
    { id: "royal", label: "皇家紫", cost: 100, color: 0xa66cff }
  ],
  laser: [
    { id: "cyan", label: "藍白雷射", cost: 0, color: 0x7df7ff },
    { id: "gold", label: "金色雷射", cost: 30, color: 0xffe66d },
    { id: "pink", label: "粉紅雷射", cost: 60, color: 0xff6bcb },
    { id: "green", label: "翠綠雷射", cost: 100, color: 0x75f7b1 }
  ],
  barrier: [
    { id: "aqua", label: "水藍防護罩", cost: 0, color: 0x76dfff },
    { id: "mint", label: "薄荷防護罩", cost: 30, color: 0x75f7b1 },
    { id: "violet", label: "紫晶防護罩", cost: 60, color: 0xa66cff },
    { id: "sun", label: "太陽防護罩", cost: 100, color: 0xffe66d }
  ]
};

const BOSS_DEFS: BossDef[] = [
  {
    level: 1,
    name: "泡泡章魚王",
    subtitle: "吐出慢速泡泡砲彈",
    texture: "boss_octopus",
    tint: 0xff8bd1,
    behavior: "bubble",
    weakpoints: [
      new Phaser.Math.Vector2(0, -24),
      new Phaser.Math.Vector2(-88, 46),
      new Phaser.Math.Vector2(-42, 72),
      new Phaser.Math.Vector2(48, 72),
      new Phaser.Math.Vector2(92, 42)
    ]
  },
  {
    level: 2,
    name: "積木飛船王",
    subtitle: "打掉積木部件後露出核心",
    texture: "boss_blocks",
    tint: 0xffc857,
    behavior: "block",
    weakpoints: [
      new Phaser.Math.Vector2(-74, -38),
      new Phaser.Math.Vector2(0, -44),
      new Phaser.Math.Vector2(74, -38),
      new Phaser.Math.Vector2(-42, 34),
      new Phaser.Math.Vector2(42, 34)
    ]
  },
  {
    level: 3,
    name: "彩虹雲朵王",
    subtitle: "放出漂亮的彎曲光球",
    texture: "boss_cloud",
    tint: 0x8ce6ff,
    behavior: "rainbow",
    weakpoints: [
      new Phaser.Math.Vector2(-80, -12),
      new Phaser.Math.Vector2(-30, -42),
      new Phaser.Math.Vector2(28, -40),
      new Phaser.Math.Vector2(82, -8),
      new Phaser.Math.Vector2(0, 36)
    ]
  },
  {
    level: 4,
    name: "鑽石蟲洞王",
    subtitle: "召喚大量小敵人",
    texture: "boss_wormhole",
    tint: 0x76f7ff,
    behavior: "wormhole",
    weakpoints: [
      new Phaser.Math.Vector2(0, -92),
      new Phaser.Math.Vector2(88, 0),
      new Phaser.Math.Vector2(0, 92),
      new Phaser.Math.Vector2(-88, 0),
      new Phaser.Math.Vector2(0, 0)
    ]
  },
  {
    level: 5,
    name: "星星機器人王",
    subtitle: "紅色菱形弱點適合飛彈鎖定",
    texture: "boss_robot",
    tint: 0xb7ff55,
    behavior: "robot",
    weakpoints: [
      new Phaser.Math.Vector2(-68, -58),
      new Phaser.Math.Vector2(68, -58),
      new Phaser.Math.Vector2(0, -4),
      new Phaser.Math.Vector2(-54, 62),
      new Phaser.Math.Vector2(54, 62)
    ]
  }
];

const createDefaultAccount = (name: string): AccountData => ({
  name,
  coins: 0,
  unlockedLevel: 1,
  owned: {
    ship: ["sky"],
    laser: ["cyan"],
    barrier: ["aqua"]
  },
  equipped: {
    ship: "sky",
    laser: "cyan",
    barrier: "aqua"
  }
});

class GameScene extends Phaser.Scene {
  private mode: GameMode = "account";
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyMissiles!: Phaser.Input.Keyboard.Key;
  private keyLaser!: Phaser.Input.Keyboard.Key;
  private player!: Phaser.Physics.Arcade.Image;
  private playerGlow!: Phaser.GameObjects.Image;
  private laserGraphics!: Phaser.GameObjects.Graphics;
  private barrierGraphics!: Phaser.GameObjects.Graphics;
  private bossHpGraphics!: Phaser.GameObjects.Graphics;
  private enemies!: Phaser.Physics.Arcade.Group;
  private missiles!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private weakpoints!: Phaser.Physics.Arcade.Group;
  private lockGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private accounts: AccountData[] = [];
  private activeAccount: AccountData | null = null;
  private accountDraftName = "";
  private accountKeyHandler?: (event: KeyboardEvent) => void;
  private selectedLevel = 1;
  private shopSelection: Record<EquipmentKind, string> = { ship: "sky", laser: "cyan", barrier: "aqua" };
  private lockedTargets: Phaser.Physics.Arcade.Image[] = [];
  private boss: BossState | null = null;
  private scoreState!: ScoreState;
  private elapsedMs = 0;
  private nextEnemyAt = 0;
  private lastMissileAt = -9999;
  private lastLaserAt = -9999;
  private barrierAlpha = 0;
  private barrierScale = 1;
  private resultMessage = "";

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
    this.enemyBullets = this.physics.add.group();
    this.weakpoints = this.physics.add.group();

    this.player = this.physics.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 160, "playerShip");
    this.player.setCircle(32, 16, 20);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(20);
    this.player.setVisible(false);

    this.playerGlow = this.add.image(this.player.x, this.player.y, "playerGlow");
    this.playerGlow.setDepth(18);
    this.playerGlow.setAlpha(0.7);
    this.playerGlow.setVisible(false);

    this.laserGraphics = this.add.graphics();
    this.laserGraphics.setDepth(17);

    this.barrierGraphics = this.add.graphics();
    this.barrierGraphics.setDepth(23);

    this.bossHpGraphics = this.add.graphics();
    this.bossHpGraphics.setDepth(48);

    this.lockGraphics = this.add.graphics();
    this.lockGraphics.setDepth(30);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyLaser = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyMissiles = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);

    this.hudText = this.add.text(24, 20, "", {
      fontFamily: "Arial",
      fontSize: "26px",
      color: "#f9fbff",
      stroke: "#101827",
      strokeThickness: 5
    });
    this.hudText.setDepth(50);
    this.hudText.setVisible(false);

    this.statusText = this.add.text(GAME_WIDTH / 2, 84, "", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#ffe28a",
      stroke: "#101827",
      strokeThickness: 5
    });
    this.statusText.setOrigin(0.5);
    this.statusText.setDepth(50);
    this.statusText.setVisible(false);

    this.physics.add.overlap(this.missiles, this.enemies, (missile, enemy) => this.onMissileHitEnemy(missile, enemy));
    this.physics.add.overlap(this.missiles, this.weakpoints, (missile, weakpoint) =>
      this.onMissileHitWeakpoint(missile, weakpoint)
    );

    this.loadAccounts();
    this.showAccountScreen();
  }

  update(time: number, delta: number) {
    this.updateFlowingGalaxy(delta);

    if (this.mode !== "play") {
      return;
    }

    this.elapsedMs += delta;
    if (this.elapsedMs >= GAME_CONFIG.durationMs) {
      this.endGame(false);
      return;
    }

    this.movePlayer();
    this.updatePlayerEffects(delta);
    this.updateBattleFlow(time);
    this.updateEnemies(delta, time);
    this.updateBoss(time, delta);
    this.updateProjectiles(delta);
    this.updateTargeting();
    this.drawTargetLocks(time);
    this.handleWeapons(time);
    this.handleLaser(time);
    this.handleBarrier();
    this.updateHud();
  }

  private createTextures() {
    this.makePlayerTexture();
    this.makeEnemyTexture("enemy_drifter", 0xffc857, 0xff6b6b);
    this.makeEnemyTexture("enemy_bubble", 0x8ce6ff, 0x5f74ff);
    this.makeEnemyTexture("enemy_shooter", 0xff8bd1, 0xa66cff);
    this.makeEnemyTexture("enemy_spark", 0xb7ff55, 0x2ee6a6);
    this.makeCircleTexture("missile", 0xfff4a3, 18, 0xff8f3d);
    this.makeCircleTexture("enemyBullet", 0xffb1d8, 12, 0xffffff);
    this.makeCircleTexture("starParticle", 0xffeb75, 8, 0xffffff);
    this.makeCircleTexture("weakpoint", 0xff2036, 16, 0xffffff);
    this.makeGlowTexture();
    this.makeBossTextures();
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

  private makeBossTextures() {
    this.makeOctopusBossTexture();
    this.makeBlockBossTexture();
    this.makeCloudBossTexture();
    this.makeWormholeBossTexture();
    this.makeRobotBossTexture();
  }

  private makeOctopusBossTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xff8bd1, 1);
    g.fillEllipse(130, 92, 154, 112);
    g.fillStyle(0xffc857, 0.9);
    for (let i = 0; i < 8; i += 1) {
      g.fillRoundedRect(32 + i * 24, 136 + (i % 2) * 12, 20, 80, 10);
    }
    g.fillStyle(0xffffff, 1);
    g.fillCircle(130, 78, 28);
    g.fillStyle(0x20344f, 1);
    g.fillCircle(130, 78, 11);
    g.generateTexture("boss_octopus", 260, 240);
    g.destroy();
  }

  private makeBlockBossTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    const colors = [0xffc857, 0xff6b6b, 0x8ce6ff, 0xb7ff55, 0xa66cff];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        g.fillStyle(colors[(row + col) % colors.length], 1);
        g.fillRoundedRect(34 + col * 40, 50 + row * 44, 36, 38, 6);
      }
    }
    g.fillStyle(0xffffff, 0.92);
    g.fillCircle(130, 114, 22);
    g.fillStyle(0x20344f, 1);
    g.fillCircle(130, 114, 8);
    g.generateTexture("boss_blocks", 260, 220);
    g.destroy();
  }

  private makeCloudBossTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    const colors = [0xff6bcb, 0xffe66d, 0x75f7b1, 0x7df7ff, 0xa66cff];
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle(colors[i], 0.88);
      g.fillEllipse(66 + i * 32, 104 - Math.abs(i - 2) * 16, 92, 82);
    }
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(110, 104, 18);
    g.fillCircle(154, 104, 18);
    g.fillStyle(0x20344f, 1);
    g.fillCircle(110, 104, 7);
    g.fillCircle(154, 104, 7);
    g.generateTexture("boss_cloud", 260, 220);
    g.destroy();
  }

  private makeWormholeBossTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x76f7ff, 0.34);
    g.fillCircle(130, 110, 96);
    g.fillStyle(0x5f74ff, 0.72);
    g.fillCircle(130, 110, 68);
    g.fillStyle(0x101827, 0.9);
    g.fillCircle(130, 110, 38);
    g.lineStyle(12, 0xfff4a3, 0.9);
    g.strokeCircle(130, 110, 84);
    g.generateTexture("boss_wormhole", 260, 220);
    g.destroy();
  }

  private makeRobotBossTexture() {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xb7ff55, 1);
    g.fillRoundedRect(66, 48, 128, 122, 18);
    g.fillStyle(0x8ce6ff, 1);
    g.fillRoundedRect(82, 72, 96, 48, 12);
    g.fillStyle(0xff2036, 0.86);
    g.fillTriangle(130, 26, 164, 56, 130, 86);
    g.fillTriangle(130, 26, 96, 56, 130, 86);
    g.fillStyle(0x20344f, 1);
    g.fillCircle(110, 96, 7);
    g.fillCircle(150, 96, 7);
    g.fillRoundedRect(102, 136, 56, 12, 6);
    g.generateTexture("boss_robot", 260, 220);
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
      const star = this.add.circle(
        Phaser.Math.Between(10, GAME_WIDTH - 10),
        Phaser.Math.Between(0, GAME_HEIGHT),
        Phaser.Math.FloatBetween(1, 3.5),
        Phaser.Utils.Array.GetRandom([0xffffff, 0xffe28a, 0x86f7ff, 0xffa9d6]),
        Phaser.Math.FloatBetween(0.25, 0.7)
      );
      star.setDepth(1);
      star.setData("backgroundFlow", {
        speed: Phaser.Math.FloatBetween(34, 115),
        baseX: star.x,
        drift: Phaser.Math.FloatBetween(4, 28),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        spin: 0,
        resetPad: 10
      });
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

  private updateFlowingGalaxy(delta: number) {
    this.children.list.forEach((child) => {
      const flow = child.getData("backgroundFlow") as
        | { speed: number; baseX: number; drift: number; phase: number; spin: number; resetPad: number }
        | undefined;
      if (!flow) return;
      const flowObject = child as unknown as { x: number; y: number; rotation: number };
      flowObject.y += flow.speed * (delta / 1000);
      flowObject.x = flow.baseX + Math.sin(this.time.now / 900 + flow.phase) * flow.drift;
      flowObject.rotation += flow.spin * (delta / 1000);
      if (flowObject.y > GAME_HEIGHT + flow.resetPad) {
        flowObject.y = -flow.resetPad;
        flow.baseX = Phaser.Math.Between(20, GAME_WIDTH - 20);
        flow.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
      }
    });
  }

  private loadAccounts() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    this.accounts = raw ? (JSON.parse(raw) as AccountData[]) : [];
    const activeName = window.localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    this.activeAccount = this.accounts.find((account) => account.name === activeName) ?? this.accounts[0] ?? null;
  }

  private saveAccounts() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.accounts));
    if (this.activeAccount) {
      window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, this.activeAccount.name);
    }
  }

  private addUi<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.uiObjects.push(object);
    (object as unknown as { setDepth: (value: number) => void }).setDepth(90);
    return object;
  }

  private clearUi() {
    this.stopAccountNameInput();
    this.uiObjects.forEach((object) => object.destroy());
    this.uiObjects = [];
  }

  private stopAccountNameInput() {
    if (this.accountKeyHandler) {
      this.input.keyboard?.off("keydown", this.accountKeyHandler);
      this.accountKeyHandler = undefined;
    }
  }

  private addButton(x: number, y: number, label: string, onClick: () => void, width = 280, color = 0x20344f) {
    const rect = this.addUi(this.add.rectangle(x, y, width, 56, color, 0.92));
    rect.setStrokeStyle(3, 0x75f7b1, 0.95);
    rect.setInteractive({ useHandCursor: true });
    rect.on("pointerdown", onClick);
    const text = this.addUi(
      this.add
        .text(x, y, label, {
          fontFamily: "Arial",
          fontSize: "24px",
          color: "#f9fbff",
          fontStyle: "bold"
        })
        .setOrigin(0.5)
    );
    text.setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    return rect;
  }

  private showAccountScreen() {
    this.mode = "account";
    this.clearBattleObjects();
    this.clearUi();
    this.setPlayVisible(false);

    this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 118, "星星守護號", {
          fontFamily: "Arial",
          fontSize: "58px",
          color: "#f9fbff",
          stroke: "#101827",
          strokeThickness: 6,
          fontStyle: "bold"
        })
        .setOrigin(0.5)
    );

    this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 188, "選擇帳號或建立新帳號", {
          fontFamily: "Arial",
          fontSize: "28px",
          color: "#ffe28a",
          stroke: "#101827",
          strokeThickness: 4
        })
        .setOrigin(0.5)
    );

    this.accounts.forEach((account, index) => {
      this.addButton(GAME_WIDTH / 2, 285 + index * 72, `${account.name}  金幣 ${account.coins}`, () => {
        this.activeAccount = account;
        this.saveAccounts();
        this.showLevelSelectScreen();
      });
    });

    this.addButton(GAME_WIDTH / 2, 780, "建立新帳號", () => this.showCreateAccountScreen());
  }

  private showCreateAccountScreen() {
    this.mode = "account";
    this.clearUi();
    this.setPlayVisible(false);
    this.accountDraftName = "";

    this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 130, "建立新帳號", {
          fontFamily: "Arial",
          fontSize: "52px",
          color: "#f9fbff",
          stroke: "#101827",
          strokeThickness: 6,
          fontStyle: "bold"
        })
        .setOrigin(0.5)
    );

    this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 208, "直接用鍵盤輸入名稱，按 Enter 開始", {
          fontFamily: "Arial",
          fontSize: "25px",
          color: "#ffe28a",
          stroke: "#101827",
          strokeThickness: 4
        })
        .setOrigin(0.5)
    );

    const inputBox = this.addUi(this.add.rectangle(GAME_WIDTH / 2, 360, 500, 82, 0xf9fbff, 0.96));
    inputBox.setStrokeStyle(5, 0x75f7b1, 1);

    const nameText = this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 360, "輸入帳號名稱", {
          fontFamily: "Arial",
          fontSize: "34px",
          color: "#6f7f94",
          fontStyle: "bold"
        })
        .setOrigin(0.5)
    );

    const errorText = this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 430, "", {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#ff8a8a",
          stroke: "#101827",
          strokeThickness: 3
        })
        .setOrigin(0.5)
    );

    const submit = () => {
      const name = this.accountDraftName.trim();
      if (!name) {
        errorText.setText("請輸入帳號名稱");
        return;
      }
      if (this.accounts.some((account) => account.name === name)) {
        errorText.setText("這個帳號名稱已經存在");
        return;
      }
      const account = createDefaultAccount(name);
      this.accounts.push(account);
      this.activeAccount = account;
      this.saveAccounts();
      this.showLevelSelectScreen();
    };

    this.accountKeyHandler = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        submit();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        this.accountDraftName = "";
        nameText.setText("輸入帳號名稱");
        nameText.setColor("#6f7f94");
        errorText.setText("");
        return;
      }
      if (event.key === "Backspace") {
        this.accountDraftName = this.accountDraftName.slice(0, -1);
        nameText.setText(this.accountDraftName || "輸入帳號名稱");
        nameText.setColor(this.accountDraftName ? "#20344f" : "#6f7f94");
        errorText.setText("");
        return;
      }
      if (event.key.length === 1 && this.accountDraftName.length < 12) {
        this.accountDraftName += event.key;
        nameText.setText(this.accountDraftName);
        nameText.setColor("#20344f");
        errorText.setText("");
      }
    };
    this.input.keyboard?.on("keydown", this.accountKeyHandler);

    this.addButton(GAME_WIDTH / 2, 555, "開始", submit, 260, 0x0c9f87);
    this.addButton(GAME_WIDTH / 2, 635, "返回", () => this.showAccountScreen(), 260, 0x38506f);
  }

  private showLevelSelectScreen() {
    if (!this.activeAccount) {
      this.showAccountScreen();
      return;
    }

    this.mode = "levelSelect";
    this.clearBattleObjects();
    this.clearUi();
    this.setPlayVisible(false);

    this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 76, `帳號：${this.activeAccount.name}   金幣：${this.activeAccount.coins}`, {
          fontFamily: "Arial",
          fontSize: "25px",
          color: "#f9fbff",
          stroke: "#101827",
          strokeThickness: 4
        })
        .setOrigin(0.5)
    );

    this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 128, "選擇關卡", {
          fontFamily: "Arial",
          fontSize: "44px",
          color: "#ffe28a",
          stroke: "#101827",
          strokeThickness: 5,
          fontStyle: "bold"
        })
        .setOrigin(0.5)
    );

    BOSS_DEFS.forEach((boss, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 270 + col * 360;
      const y = 272 + row * 250;
      const unlocked = boss.level <= this.activeAccount!.unlockedLevel;
      const completed = boss.level < this.activeAccount!.unlockedLevel;
      const card = this.addUi(this.add.rectangle(x, y, 300, 204, unlocked ? 0xf9fbff : 0x20344f, unlocked ? 0.94 : 0.48));
      card.setStrokeStyle(5, boss.level === this.activeAccount!.unlockedLevel ? 0xffe66d : 0x75f7b1, unlocked ? 1 : 0.35);

      const image = this.addUi(this.add.image(x, y - 40, boss.texture));
      image.setScale(0.46);
      image.setAlpha(unlocked ? 1 : 0.28);
      image.setTint(unlocked ? 0xffffff : 0x4d5b70);

      const status = completed ? "已通關，可重玩" : boss.level === this.activeAccount!.unlockedLevel ? "目前關卡" : "尚未解鎖";
      this.addUi(
        this.add
          .text(x, y + 58, `第${boss.level}關 ${boss.name}\n${status}`, {
            fontFamily: "Arial",
            fontSize: "20px",
            color: unlocked ? "#20344f" : "#9aa8ba",
            align: "center",
            lineSpacing: 6,
            fontStyle: "bold"
          })
          .setOrigin(0.5)
      );

      if (unlocked) {
        card.setInteractive({ useHandCursor: true });
        image.setInteractive({ useHandCursor: true });
        const choose = () => {
          this.selectedLevel = boss.level;
          this.showShopScreen();
        };
        card.on("pointerdown", choose);
        image.on("pointerdown", choose);
      }
    });

    this.addButton(168, 1008, "切換帳號", () => this.showAccountScreen(), 220, 0x38506f);
  }

  private showShopScreen() {
    if (!this.activeAccount) return;

    this.mode = "shop";
    this.clearUi();
    this.setPlayVisible(false);
    this.shopSelection = { ...this.activeAccount.equipped };

    this.addUi(
      this.add
        .text(GAME_WIDTH / 2, 70, `第${this.selectedLevel}關戰前換裝   金幣：${this.activeAccount.coins}`, {
          fontFamily: "Arial",
          fontSize: "30px",
          color: "#f9fbff",
          stroke: "#101827",
          strokeThickness: 4,
          fontStyle: "bold"
        })
        .setOrigin(0.5)
    );

    this.drawEquipmentRow("ship", "飛機顏色", 190);
    this.drawEquipmentRow("laser", "雷射顏色", 415);
    this.drawEquipmentRow("barrier", "防護罩顏色", 640);

    this.addButton(GAME_WIDTH / 2, 940, "確認換裝並出發", () => this.confirmLoadout(), 330, 0x0c9f87);
    this.addButton(166, 1018, "回關卡", () => this.showLevelSelectScreen(), 220, 0x38506f);
  }

  private drawEquipmentRow(kind: EquipmentKind, title: string, y: number) {
    if (!this.activeAccount) return;

    this.addUi(
      this.add
        .text(86, y - 76, title, {
          fontFamily: "Arial",
          fontSize: "26px",
          color: "#ffe28a",
          stroke: "#101827",
          strokeThickness: 4,
          fontStyle: "bold"
        })
        .setOrigin(0, 0.5)
    );

    EQUIPMENT[kind].forEach((option, index) => {
      const x = 140 + index * 205;
      const owned = this.activeAccount!.owned[kind].includes(option.id);
      const selected = this.shopSelection[kind] === option.id;
      const rect = this.addUi(this.add.rectangle(x, y, 166, 142, option.color, owned ? 0.9 : 0.28));
      rect.setStrokeStyle(selected ? 7 : 3, selected ? 0xffffff : 0x38506f, selected ? 1 : 0.6);
      rect.setInteractive({ useHandCursor: true });
      rect.on("pointerdown", () => {
        this.shopSelection[kind] = option.id;
        this.showShopScreen();
      });

      const label = owned ? "已購買" : `${option.cost} 金幣`;
      this.addUi(
        this.add
          .text(x, y + 4, `${option.label}\n${label}`, {
            fontFamily: "Arial",
            fontSize: "19px",
            color: owned ? "#101827" : "#e1e7ef",
            align: "center",
            lineSpacing: 9,
            fontStyle: "bold"
          })
          .setOrigin(0.5)
      );
    });
  }

  private confirmLoadout() {
    if (!this.activeAccount) return;

    const purchases: Array<{ kind: EquipmentKind; option: EquipmentOption }> = [];
    (["ship", "laser", "barrier"] as EquipmentKind[]).forEach((kind) => {
      const selected = this.shopSelection[kind];
      if (!this.activeAccount!.owned[kind].includes(selected)) {
        const option = EQUIPMENT[kind].find((item) => item.id === selected)!;
        purchases.push({ kind, option });
      }
    });

    const totalCost = purchases.reduce((sum, item) => sum + item.option.cost, 0);
    if (this.activeAccount.coins < totalCost) {
      window.alert(`金幣不足，還需要 ${totalCost - this.activeAccount.coins} 金幣`);
      return;
    }

    this.activeAccount.coins -= totalCost;
    purchases.forEach(({ kind, option }) => this.activeAccount!.owned[kind].push(option.id));
    this.activeAccount.equipped = { ...this.shopSelection };
    this.saveAccounts();
    this.startBattle();
  }

  private startBattle() {
    if (!this.activeAccount) return;

    this.mode = "play";
    this.clearUi();
    this.clearBattleObjects();
    this.setPlayVisible(true);

    this.scoreState = {
      score: 0,
      hits: 0,
      missilesFired: 0,
      laserHits: 0,
      shieldBlocks: 0,
      bossWeakpointHits: 0,
      coinsEarned: 0,
      combo: 0,
      bestCombo: 0,
      bossDefeated: false
    };

    this.elapsedMs = 0;
    this.nextEnemyAt = 0;
    this.lastMissileAt = -9999;
    this.lastLaserAt = -9999;
    this.barrierAlpha = 0;
    this.barrierScale = 1;
    this.boss = null;
    this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 160);
    this.player.setTint(this.getEquippedColor("ship"));
    this.playerGlow.setPosition(this.player.x, this.player.y);
    this.statusText.setText("方向鍵移動  A 雷射  S 飛彈");
  }

  private setPlayVisible(visible: boolean) {
    this.player?.setVisible(visible);
    this.playerGlow?.setVisible(visible);
    this.hudText?.setVisible(visible);
    this.statusText?.setVisible(visible);
    if (!visible) {
      this.lockGraphics?.clear();
      this.laserGraphics?.clear();
      this.barrierGraphics?.clear();
      this.bossHpGraphics?.clear();
    }
  }

  private clearBattleObjects() {
    this.enemies?.clear(true, true);
    this.missiles?.clear(true, true);
    this.enemyBullets?.clear(true, true);
    this.weakpoints?.clear(true, true);
    this.boss?.sprite.destroy();
    this.boss = null;
    this.lockedTargets = [];
    this.lockGraphics?.clear();
    this.laserGraphics?.clear();
    this.barrierGraphics?.clear();
    this.bossHpGraphics?.clear();
  }

  private getEquippedColor(kind: EquipmentKind) {
    if (!this.activeAccount) return EQUIPMENT[kind][0].color;
    const option = EQUIPMENT[kind].find((item) => item.id === this.activeAccount!.equipped[kind]);
    return option?.color ?? EQUIPMENT[kind][0].color;
  }

  private movePlayer() {
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

  private updatePlayerEffects(delta: number) {
    this.playerGlow.setScale(1 + Math.sin(this.time.now / 180) * 0.04);
    this.barrierAlpha = Math.max(0, this.barrierAlpha - delta / 360);
    this.barrierScale += delta / 1900;
    this.drawBarrierEffect();
  }

  private updateBattleFlow(time: number) {
    if (this.elapsedMs < GAME_CONFIG.bossSpawnMs) {
      this.spawnEnemies(time);
      return;
    }

    if (!this.boss) {
      this.spawnBoss(time);
      this.showStatus(`${BOSS_DEFS[this.selectedLevel - 1].name} 出現了`);
    }

    if (this.boss?.def.behavior === "wormhole" && time > this.boss.nextSummonAt) {
      for (let i = 0; i < 3; i += 1) this.createEnemy(0.8);
      this.boss.nextSummonAt = time + 2500;
    }
  }

  private spawnEnemies(time: number) {
    if (time < this.nextEnemyAt) return;
    const phase = this.elapsedMs / GAME_CONFIG.durationMs;
    const count = phase > 0.75 ? Phaser.Math.Between(2, 4) : phase > 0.34 ? Phaser.Math.Between(1, 3) : 1;
    for (let i = 0; i < count; i += 1) this.createEnemy(phase);
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
    const enemy = this.physics.add.image(Phaser.Math.Between(70, GAME_WIDTH - 70), -70, `enemy_${kind}`);
    enemy.setDepth(12);
    enemy.setCircle(28, 8, 7);
    enemy.setData("enemy", {
      kind,
      value: kind === "spark" ? 180 : kind === "shooter" ? 150 : 100,
      hp: GAME_CONFIG.enemyHp,
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
          this.fireEnemyBullet(enemy.x, enemy.y + 30, 260);
          data.shootCooldown = Phaser.Math.Between(1250, 2200);
        }
      }
      if (enemy.y > GAME_HEIGHT + 90) {
        enemy.destroy();
        this.scoreState.combo = 0;
      }
      return true;
    });
  }

  private spawnBoss(time: number) {
    const def = BOSS_DEFS[this.selectedLevel - 1];
    const sprite = this.physics.add.image(GAME_WIDTH / 2, 170, def.texture);
    sprite.setDepth(13);
    sprite.setScale(1);
    sprite.setImmovable(true);
    sprite.setVelocityX(70);

    this.boss = {
      def,
      sprite,
      hp: GAME_CONFIG.bossHp,
      maxHp: GAME_CONFIG.bossHp,
      weakpointHp: GAME_CONFIG.bossHp / 5,
      nextShotAt: time + 900,
      nextSummonAt: time + 1500,
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2)
    };

    def.weakpoints.forEach((offset, index) => {
      const point = this.physics.add.image(sprite.x + offset.x, sprite.y + offset.y, "weakpoint");
      point.setDepth(31);
      point.setCircle(14);
      point.setData("weakpoint", {
        index,
        hp: this.boss!.weakpointHp,
        offset,
        blockPart: def.behavior === "block"
      });
      this.weakpoints.add(point);
    });
  }

  private updateBoss(time: number, delta: number) {
    if (!this.boss) return;

    const boss = this.boss;
    boss.phase += delta / 1000;
    boss.sprite.setVelocityX(Math.sin(boss.phase * 0.75) * 90);
    boss.sprite.y = 170 + Math.sin(boss.phase) * 18;

    boss.def.weakpoints.forEach((_offset, index) => {
      const weakpoint = this.weakpoints.getChildren()[index] as Phaser.Physics.Arcade.Image | undefined;
      if (!weakpoint?.active) return;
      const data = weakpoint.getData("weakpoint") as { offset: Phaser.Math.Vector2 };
      weakpoint.setPosition(boss.sprite.x + data.offset.x, boss.sprite.y + data.offset.y);
      weakpoint.setRotation(Math.PI / 4 + Math.sin(time / 130) * 0.18);
    });

    if (boss.sprite.x < 160) boss.phase = Math.abs(boss.phase);
    if (boss.sprite.x > GAME_WIDTH - 160) boss.phase = -Math.abs(boss.phase);

    if (time > boss.nextShotAt) {
      this.fireBossPattern(time);
      boss.nextShotAt = time + (boss.def.behavior === "rainbow" ? 820 : 1150);
    }

    this.drawBossHp();
  }

  private fireBossPattern(time: number) {
    if (!this.boss) return;
    const boss = this.boss;
    if (boss.def.behavior === "rainbow") {
      for (let i = -1; i <= 1; i += 1) {
        this.fireEnemyBullet(boss.sprite.x + i * 46, boss.sprite.y + 82, 210, "curve", i * 50);
      }
      return;
    }
    if (boss.def.behavior === "robot") {
      for (let i = -2; i <= 2; i += 1) {
        this.fireEnemyBullet(boss.sprite.x + i * 34, boss.sprite.y + 78, 250);
      }
      return;
    }
    this.fireEnemyBullet(boss.sprite.x, boss.sprite.y + 90, boss.def.behavior === "bubble" ? 185 : 230);
  }

  private updateProjectiles(delta: number) {
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

    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      const curve = bullet.getData("curve") as { baseX: number; drift: number; phase: number } | undefined;
      if (curve) bullet.x = curve.baseX + Math.sin(this.time.now / 250 + curve.phase) * curve.drift;
      if (bullet.body && Math.abs(bullet.body.velocity.y) < 1) bullet.setVelocityY(260);
      if (bullet.y > GAME_HEIGHT + 50 || bullet.x < -60 || bullet.x > GAME_WIDTH + 60) bullet.destroy();
      return true;
    });
  }

  private updateTargeting() {
    const targets = [
      ...this.enemies.getChildren().map((child) => child as Phaser.Physics.Arcade.Image),
      ...this.weakpoints.getChildren().map((child) => child as Phaser.Physics.Arcade.Image)
    ]
      .filter((target) => target.active && target.y > 20 && target.y < GAME_HEIGHT - 130)
      .sort((a, b) => {
        const da = Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y);
        const db = Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y);
        return da - db || a.y - b.y;
      });
    this.lockedTargets = targets.slice(0, GAME_CONFIG.maxLocks);
  }

  private drawTargetLocks(time: number) {
    this.lockGraphics.clear();
    this.lockedTargets.forEach((target, index) => {
      const flash = 0.35 + ((Math.sin(time / 95 + index * 1.7) + 1) / 2) * 0.65;
      const radius = 48 + Math.sin(time / 150 + index) * 5;
      this.lockGraphics.fillStyle(0xff2036, 0.08 + flash * 0.12);
      this.lockGraphics.lineStyle(4, 0xff2036, flash);
      this.lockGraphics.beginPath();
      this.lockGraphics.moveTo(target.x, target.y - radius);
      this.lockGraphics.lineTo(target.x + radius, target.y);
      this.lockGraphics.lineTo(target.x, target.y + radius);
      this.lockGraphics.lineTo(target.x - radius, target.y);
      this.lockGraphics.closePath();
      this.lockGraphics.fillPath();
      this.lockGraphics.strokePath();
      this.lockGraphics.lineStyle(2, 0xff8a8a, flash * 0.75);
      this.lockGraphics.beginPath();
      this.lockGraphics.moveTo(target.x, target.y - radius - 10);
      this.lockGraphics.lineTo(target.x + radius + 10, target.y);
      this.lockGraphics.lineTo(target.x, target.y + radius + 10);
      this.lockGraphics.lineTo(target.x - radius - 10, target.y);
      this.lockGraphics.closePath();
      this.lockGraphics.strokePath();
    });
  }

  private handleWeapons(time: number) {
    if (Phaser.Input.Keyboard.JustDown(this.keyMissiles) && time - this.lastMissileAt >= GAME_CONFIG.missileCooldownMs) {
      this.fireMissiles(time);
    }
  }

  private handleLaser(time: number) {
    this.laserGraphics.clear();
    if (!this.keyLaser.isDown) return;
    const beamX = this.player.x;
    const beamStartY = this.player.y - 76;
    const beamEndY = -20;
    const beamWidth = 36 + Math.sin(time / 70) * 5;
    this.drawLaserBeam(beamX, beamStartY, beamEndY, beamWidth, time);
    if (time - this.lastLaserAt < GAME_CONFIG.laserCooldownMs) return;
    this.lastLaserAt = time;

    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (enemy.active && Math.abs(enemy.x - beamX) <= beamWidth && enemy.y <= beamStartY && enemy.y >= beamEndY) {
        this.damageEnemy(enemy, GAME_CONFIG.weaponDamage, "laser");
      }
      return true;
    });

    this.weakpoints.children.each((child) => {
      const weakpoint = child as Phaser.Physics.Arcade.Image;
      if (weakpoint.active && Math.abs(weakpoint.x - beamX) <= beamWidth && weakpoint.y <= beamStartY && weakpoint.y >= beamEndY) {
        this.damageWeakpoint(weakpoint, GAME_CONFIG.weaponDamage);
        this.scoreState.laserHits += 1;
      }
      return true;
    });
  }

  private drawLaserBeam(beamX: number, beamStartY: number, beamEndY: number, beamWidth: number, time: number) {
    const color = this.getEquippedColor("laser");
    const innerPulse = 0.72 + Math.sin(time / 45) * 0.16;
    this.laserGraphics.fillStyle(color, 0.13);
    this.laserGraphics.fillRect(beamX - beamWidth, beamEndY, beamWidth * 2, beamStartY - beamEndY);
    this.laserGraphics.lineStyle(16, color, 0.25);
    this.laserGraphics.lineBetween(beamX, beamStartY, beamX, beamEndY);
    this.laserGraphics.lineStyle(8, 0xffffff, innerPulse);
    this.laserGraphics.lineBetween(beamX, beamStartY, beamX, beamEndY);
    this.laserGraphics.lineStyle(3, 0xfff4a3, 0.9);
    this.laserGraphics.lineBetween(beamX - 10, beamStartY, beamX - 4, beamEndY);
    this.laserGraphics.lineBetween(beamX + 10, beamStartY, beamX + 4, beamEndY);
  }

  private fireMissiles(time: number) {
    if (this.lockedTargets.length === 0) {
      this.showStatus("沒有目標，先靠近敵人");
      return;
    }
    this.lastMissileAt = time;
    this.lockedTargets.forEach((target, index) => {
      const missile = this.physics.add.image(this.player.x + (index - 2.5) * 16, this.player.y - 48, "missile");
      missile.setDepth(16);
      missile.setData("target", target);
      missile.setCircle(13);
      this.physics.moveToObject(missile, target, 550);
      this.missiles.add(missile);
      this.scoreState.missilesFired += 1;
    });
    this.showStatus(`飛彈齊射 x${this.lockedTargets.length}`);
  }

  private fireEnemyBullet(x: number, y: number, speed: number, mode: "straight" | "curve" = "straight", drift = 0) {
    const bullet = this.physics.add.image(x, y, "enemyBullet");
    bullet.setDepth(11);
    bullet.setCircle(10);
    bullet.setVelocity(0, speed);
    if (mode === "curve") bullet.setData("curve", { baseX: x, drift, phase: Phaser.Math.FloatBetween(0, Math.PI * 2) });
    this.enemyBullets.add(bullet);
  }

  private handleBarrier() {
    let blocked = false;
    this.enemyBullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, bullet.x, bullet.y);
      if (distance <= GAME_CONFIG.barrierRadius) {
        bullet.destroy();
        blocked = true;
        this.scoreState.shieldBlocks += 1;
        this.scoreState.score += 25 + this.scoreState.combo * 2;
        this.spawnSparkles(this.player.x, this.player.y, this.getEquippedColor("barrier"), 8);
      }
      return true;
    });

    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (distance <= GAME_CONFIG.barrierRadius + 12) {
        this.damageEnemy(enemy, GAME_CONFIG.enemyHp, "barrier");
        blocked = true;
      }
      return true;
    });

    if (blocked) {
      this.barrierAlpha = 1;
      this.barrierScale = 0.92;
      this.showStatus("12邊形防護罩啟動");
    }
  }

  private drawBarrierEffect() {
    this.barrierGraphics.clear();
    if (this.barrierAlpha <= 0) return;
    const fillColor = this.getEquippedColor("barrier");
    const strokeColor = 0xffffff;
    const points = [];
    const radius = GAME_CONFIG.barrierRadius * this.barrierScale;
    for (let i = 0; i < 12; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / 12;
      points.push({ x: this.player.x + Math.cos(angle) * radius, y: this.player.y + Math.sin(angle) * radius });
    }
    this.barrierGraphics.fillStyle(fillColor, 0.16 * this.barrierAlpha);
    this.barrierGraphics.lineStyle(5, fillColor, 0.7 * this.barrierAlpha);
    this.barrierGraphics.beginPath();
    this.barrierGraphics.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => this.barrierGraphics.lineTo(point.x, point.y));
    this.barrierGraphics.closePath();
    this.barrierGraphics.fillPath();
    this.barrierGraphics.strokePath();
    this.barrierGraphics.lineStyle(2, strokeColor, 0.35 * this.barrierAlpha);
    this.barrierGraphics.strokePath();
  }

  private onMissileHitEnemy(missileObject: unknown, enemyObject: unknown) {
    (missileObject as Phaser.GameObjects.GameObject).destroy();
    this.damageEnemy(enemyObject as Phaser.Physics.Arcade.Image, GAME_CONFIG.weaponDamage, "missile");
  }

  private onMissileHitWeakpoint(missileObject: unknown, weakpointObject: unknown) {
    (missileObject as Phaser.GameObjects.GameObject).destroy();
    this.damageWeakpoint(weakpointObject as Phaser.Physics.Arcade.Image, GAME_CONFIG.weaponDamage);
  }

  private damageEnemy(enemy: Phaser.Physics.Arcade.Image, damage: number, source: "laser" | "missile" | "barrier") {
    if (!enemy.active) return;
    const data = enemy.getData("enemy") as EnemyData;
    data.hp -= damage;
    if (data.hp > 0) return;

    this.scoreState.hits += 1;
    this.scoreState.combo += 1;
    this.scoreState.bestCombo = Math.max(this.scoreState.bestCombo, this.scoreState.combo);
    if (source === "laser") this.scoreState.laserHits += 1;
    this.scoreState.score += data.value + this.scoreState.combo * 6;
    this.scoreState.coinsEarned += 1;
    this.spawnSparkles(enemy.x, enemy.y, source === "barrier" ? this.getEquippedColor("barrier") : 0xffe66d, 14);
    enemy.destroy();
  }

  private damageWeakpoint(weakpoint: Phaser.Physics.Arcade.Image, damage: number) {
    if (!this.boss || !weakpoint.active) return;
    const data = weakpoint.getData("weakpoint") as { hp: number; blockPart: boolean };
    data.hp -= damage;
    this.boss.hp = Math.max(0, this.boss.hp - damage);
    this.scoreState.bossWeakpointHits += 1;
    this.scoreState.score += 40 + this.scoreState.combo * 3;
    this.scoreState.coinsEarned += 1;
    this.spawnSparkles(weakpoint.x, weakpoint.y, 0xff2036, 6);

    if (data.hp <= 0) {
      if (data.blockPart) this.spawnFallingBlocks(weakpoint.x, weakpoint.y);
      weakpoint.destroy();
    }

    if (this.boss.hp <= 0) {
      this.scoreState.bossDefeated = true;
      this.scoreState.coinsEarned += 100;
      this.scoreState.score += 5000;
      this.spawnSparkles(this.boss.sprite.x, this.boss.sprite.y, 0xffe66d, 40);
      this.endGame(true);
    }
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

  private spawnFallingBlocks(x: number, y: number) {
    const colors = [0xffc857, 0xff6b6b, 0x8ce6ff, 0xb7ff55, 0xa66cff];
    for (let i = 0; i < 7; i += 1) {
      const block = this.add.rectangle(x, y, Phaser.Math.Between(14, 24), Phaser.Math.Between(12, 22), colors[i % colors.length], 0.95);
      block.setDepth(29);
      this.tweens.add({
        targets: block,
        x: x + Phaser.Math.Between(-90, 90),
        y: y + Phaser.Math.Between(80, 180),
        rotation: Phaser.Math.FloatBetween(-2.8, 2.8),
        alpha: 0,
        duration: Phaser.Math.Between(700, 1100),
        ease: "Cubic.easeIn",
        onComplete: () => block.destroy()
      });
    }
    this.spawnSparkles(x, y, 0xffc857, 10);
  }

  private drawBossHp() {
    this.bossHpGraphics.clear();
    if (!this.boss) return;
    const x = 170;
    const y = 138;
    const width = 560;
    const pct = Phaser.Math.Clamp(this.boss.hp / this.boss.maxHp, 0, 1);
    this.bossHpGraphics.fillStyle(0x101827, 0.8);
    this.bossHpGraphics.fillRoundedRect(x, y, width, 30, 8);
    this.bossHpGraphics.fillStyle(0xff2036, 0.95);
    this.bossHpGraphics.fillRoundedRect(x + 4, y + 4, (width - 8) * pct, 22, 6);
    this.bossHpGraphics.lineStyle(3, 0xffffff, 0.72);
    this.bossHpGraphics.strokeRoundedRect(x, y, width, 30, 8);
  }

  private updateHud() {
    const remaining = Math.max(0, GAME_CONFIG.durationMs - this.elapsedMs);
    const minutes = Math.floor(remaining / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000)
      .toString()
      .padStart(2, "0");
    const bossText = this.boss ? `\nBoss ${this.boss.hp}/${this.boss.maxHp}` : "";
    this.hudText.setText(
      `關卡 ${this.selectedLevel}\n時間 ${minutes}:${seconds}\n分數 ${this.scoreState.score}\n金幣 +${this.scoreState.coinsEarned}\n連段 ${this.scoreState.combo}  鎖定 ${this.lockedTargets.length}${bossText}`
    );
  }

  private showStatus(message: string) {
    this.statusText.setText(message);
    this.statusText.setAlpha(1);
    this.tweens.killTweensOf(this.statusText);
    this.tweens.add({ targets: this.statusText, alpha: 0.55, duration: 800 });
  }

  private endGame(success: boolean) {
    if (this.mode !== "play") return;
    this.mode = "result";
    this.resultMessage = success ? "Boss 擊退成功！" : "時間到，Boss 下次再挑戰！";
    this.physics.pause();
    this.lockGraphics.clear();
    this.laserGraphics.clear();
    this.barrierGraphics.clear();
    this.bossHpGraphics.clear();

    if (this.activeAccount) {
      this.activeAccount.coins += this.scoreState.coinsEarned;
      if (success && this.selectedLevel === this.activeAccount.unlockedLevel) {
        this.activeAccount.unlockedLevel = Math.min(BOSS_DEFS.length, this.activeAccount.unlockedLevel + 1);
      }
      this.saveAccounts();
    }

    const backdrop = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x101827, 0.78);
    backdrop.setDepth(80);
    this.uiObjects.push(backdrop);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 680, 650, 0xf9fbff, 0.96);
    panel.setStrokeStyle(8, success ? 0x75f7b1 : 0xffe66d, 1);
    panel.setDepth(81);
    this.uiObjects.push(panel);

    const medals = this.getMedals(success);
    const lines = [
      this.resultMessage,
      `總分 ${this.scoreState.score}`,
      medals.join("\n"),
      `本關金幣 +${this.scoreState.coinsEarned}`,
      `擊中 ${this.scoreState.hits}  Boss弱點 ${this.scoreState.bossWeakpointHits}`,
      `防護罩擋彈 ${this.scoreState.shieldBlocks}  最佳連段 ${this.scoreState.bestCombo}`
    ];

    this.addUi(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 228, lines.join("\n\n"), {
          fontFamily: "Arial",
          fontSize: "31px",
          color: "#20344f",
          align: "center",
          lineSpacing: 6,
          fontStyle: "bold"
        })
        .setOrigin(0.5, 0)
    );

    this.addButton(GAME_WIDTH / 2 - 170, GAME_HEIGHT / 2 + 260, "回關卡", () => {
      this.physics.resume();
      this.showLevelSelectScreen();
    }, 250, 0x38506f);
    this.addButton(GAME_WIDTH / 2 + 170, GAME_HEIGHT / 2 + 260, "再玩一次", () => {
      this.physics.resume();
      this.showShopScreen();
    }, 250, 0x0c9f87);
  }

  private getMedals(success: boolean) {
    const medals = ["星星獎章：完成守護任務"];
    if (success) medals.push("大魔王挑戰獎章：成功擊退Boss");
    if (this.scoreState.shieldBlocks >= 4) medals.push("守護者獎章：12邊形防護罩很可靠");
    if (this.scoreState.bossWeakpointHits >= 25) medals.push("弱點高手獎章：Boss弱點命中很多次");
    if (this.scoreState.hits >= 45 || this.scoreState.bestCombo >= 18) medals.push("神射手獎章：鎖定飛彈超準");
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
