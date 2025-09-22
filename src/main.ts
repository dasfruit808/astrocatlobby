import Phaser from "phaser";
import "./style.css";

type StatKey = "hp" | "mp" | "exp";

interface PlayerStats {
  name: string;
  level: number;
  rank: string;
  exp: number;
  maxExp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  hairColor: number;
  skinColor: number;
  shirtColor: number;
}

interface StatBar {
  fill: Phaser.GameObjects.Rectangle;
  valueLabel: Phaser.GameObjects.Text;
  maxWidth: number;
}

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    this.createTextures();
  }

  private createTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(0xffb6c1, 1);
    graphics.fillRoundedRect(0, 0, 24, 32, 4);
    graphics.fillStyle(0x8b4513, 1);
    graphics.fillCircle(12, 8, 6);
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(8, 6, 1);
    graphics.fillCircle(16, 6, 1);
    graphics.generateTexture("player", 24, 32);
    graphics.clear();

    graphics.fillStyle(0x228b22, 1);
    graphics.fillRect(0, 0, 64, 32);
    graphics.generateTexture("ground", 64, 32);
    graphics.clear();

    graphics.fillStyle(0x8b4513, 1);
    graphics.fillRect(14, 16, 4, 16);
    graphics.fillStyle(0x228b22, 1);
    graphics.fillCircle(16, 12, 12);
    graphics.generateTexture("tree", 32, 32);
    graphics.clear();

    graphics.fillStyle(0x8b4513, 1);
    graphics.fillRoundedRect(0, 0, 24, 16, 2);
    graphics.fillStyle(0xffd700, 1);
    graphics.fillRect(10, 6, 4, 2);
    graphics.generateTexture("chest", 24, 16);
    graphics.clear();

    graphics.fillStyle(0x9370db, 1);
    graphics.fillTriangle(8, 0, 0, 16, 16, 16);
    graphics.generateTexture("crystal", 16, 16);
    graphics.clear();

    graphics.fillStyle(0x87ceeb, 1);
    graphics.fillRect(0, 0, 800, 400);
    graphics.fillStyle(0x98fb98, 1);
    for (let i = 0; i < 10; i += 1) {
      graphics.fillCircle(i * 80 + 40, 350, 30);
    }
    graphics.generateTexture("background", 800, 400);
    graphics.clear();

    graphics.destroy();
  }

  create(): void {
    this.scene.start("GameScene");
  }
}

class GameScene extends Phaser.Scene {
  private readonly playerData: PlayerStats = {
    name: "PixelHero",
    level: 15,
    rank: "Adventurer",
    exp: 750,
    maxExp: 1000,
    hp: 85,
    maxHp: 100,
    mp: 40,
    maxMp: 60,
    hairColor: 0x8b4513,
    skinColor: 0xffb6c1,
    shirtColor: 0x4169e1
  };

  private isCustomizing = false;

  private gameAreaWidth = 0;

  private getScaleWidth(): number {
    const width = this.scale.gameSize.width;
    if (width > 0) {
      return width;
    }

    const configWidth = this.game.config.width;
    if (typeof configWidth === "number" && configWidth > 0) {
      return configWidth;
    }

    return window.innerWidth;
  }

  private getScaleHeight(): number {
    const height = this.scale.gameSize.height;
    if (height > 0) {
      return height;
    }

    const configHeight = this.game.config.height;
    if (typeof configHeight === "number" && configHeight > 0) {
      return configHeight;
    }

    return window.innerHeight;
  }

  private platforms!: Phaser.Physics.Arcade.StaticGroup;

  private player!: Phaser.Physics.Arcade.Sprite;

  private interactables!: Phaser.Physics.Arcade.StaticGroup;

  private interactionText!: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  private interactKey!: Phaser.Input.Keyboard.Key;

  private nearObject?: Phaser.Physics.Arcade.Sprite;

  private uiStartX = 0;

  private uiRect!: Phaser.GameObjects.Rectangle;

  private charPortraitFrame!: Phaser.GameObjects.Rectangle;

  private portraitGraphics!: Phaser.GameObjects.Graphics;

  private nameText!: Phaser.GameObjects.Text;

  private levelText!: Phaser.GameObjects.Text;

  private rankText!: Phaser.GameObjects.Text;

  private statBars!: Record<StatKey, StatBar>;

  private customButton!: Phaser.GameObjects.Rectangle;

  private customButtonText!: Phaser.GameObjects.Text;

  private customPanel!: Phaser.GameObjects.Container;

  private hairButtons: Phaser.GameObjects.Rectangle[] = [];

  private skinButtons: Phaser.GameObjects.Rectangle[] = [];

  private shirtButtons: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.setupGameArea();
    this.setupUI();
    this.setupPlayer();
    this.setupInteractables();
    this.setupControls();
    this.setupCamera();
    this.updateCharacterAppearance();
    this.updateUI();
  }

  private setupGameArea(): void {
    const scaleWidth = this.getScaleWidth();
    const scaleHeight = this.getScaleHeight();

    this.gameAreaWidth = Math.max(960, Math.floor(scaleWidth * 0.65));

    const bg = this.add.image(this.gameAreaWidth / 2, scaleHeight / 2, "background");
    bg.setDisplaySize(this.gameAreaWidth, scaleHeight);

    this.physics.world.setBounds(0, 0, this.gameAreaWidth + 400, scaleHeight);

    this.platforms = this.physics.add.staticGroup();
    for (let x = -64; x <= this.gameAreaWidth + 256; x += 64) {
      const ground = this.platforms.create(x, scaleHeight - 50, "ground");
      ground.setOrigin(0, 0);
      ground.refreshBody();
    }

    for (let i = 0; i < 5; i += 1) {
      const platform = this.platforms.create(200 + i * 150, scaleHeight - 180 - i * 30, "ground");
      platform.setDisplaySize(100, 20);
      platform.refreshBody();
    }
  }

  private setupUI(): void {
    this.uiStartX = Math.floor(this.gameAreaWidth) + 20;

    const scaleWidth = this.getScaleWidth();
    const scaleHeight = this.getScaleHeight();
    const uiWidth = Math.max(260, scaleWidth - this.uiStartX - 20);

    this.uiRect = this.add.rectangle(this.uiStartX, 0, uiWidth, scaleHeight, 0x2c2c54, 0.9);
    this.uiRect.setOrigin(0, 0);
    this.uiRect.setScrollFactor(0);

    this.charPortraitFrame = this.add.rectangle(this.uiStartX + uiWidth / 2, 90, 160, 160, 0x1c1c3a, 0.9);
    this.charPortraitFrame.setStrokeStyle(3, 0xffd700);
    this.charPortraitFrame.setScrollFactor(0);

    this.portraitGraphics = this.add.graphics();
    this.portraitGraphics.setScrollFactor(0);
    this.portraitGraphics.setDepth(1);

    const header = this.add.text(this.uiStartX + 20, 190, "Character Info", {
      fontSize: "20px",
      color: "#FFD700",
      fontFamily: "Arial"
    });
    header.setScrollFactor(0);

    this.nameText = this.add.text(this.uiStartX + 20, 220, "", {
      fontSize: "16px",
      color: "#FFFFFF"
    });
    this.nameText.setScrollFactor(0);

    this.levelText = this.add.text(this.uiStartX + 20, 248, "", {
      fontSize: "16px",
      color: "#FFFFFF"
    });
    this.levelText.setScrollFactor(0);

    this.rankText = this.add.text(this.uiStartX + 20, 276, "", {
      fontSize: "16px",
      color: "#FFFFFF"
    });
    this.rankText.setScrollFactor(0);

    this.statBars = {
      hp: this.createStatBar(this.uiStartX + 20, 320, "HP", this.playerData.hp, this.playerData.maxHp, 0xff0000),
      mp: this.createStatBar(this.uiStartX + 20, 360, "MP", this.playerData.mp, this.playerData.maxMp, 0x0000ff),
      exp: this.createStatBar(this.uiStartX + 20, 400, "EXP", this.playerData.exp, this.playerData.maxExp, 0x00ff00)
    };

    this.customButton = this.add.rectangle(this.uiStartX + uiWidth / 2, 450, 140, 44, 0x4169e1, 1);
    this.customButton.setStrokeStyle(2, 0xffffff);
    this.customButton.setScrollFactor(0);
    this.customButton.setInteractive({ useHandCursor: true });
    this.customButton.on("pointerdown", () => this.toggleCustomization());

    this.customButtonText = this.add.text(this.customButton.x, this.customButton.y, "Customize", {
      fontSize: "16px",
      color: "#FFFFFF"
    });
    this.customButtonText.setOrigin(0.5);
    this.customButtonText.setScrollFactor(0);

    this.setupCustomizationPanel(uiWidth);
  }

  private createStatBar(
    x: number,
    y: number,
    label: string,
    current: number,
    max: number,
    color: number
  ): StatBar {
    const labelText = this.add.text(x, y - 18, label, {
      fontSize: "14px",
      color: "#FFFFFF"
    });
    labelText.setScrollFactor(0);

    const barBg = this.add.rectangle(x, y, 160, 16, 0x333333, 1);
    barBg.setOrigin(0, 0);
    barBg.setScrollFactor(0);

    const barFill = this.add.rectangle(x + 2, y + 2, (current / max) * 156, 12, color, 1);
    barFill.setOrigin(0, 0);
    barFill.setScrollFactor(0);

    const valueLabel = this.add.text(x + 170, y - 1, `${current}/${max}`, {
      fontSize: "12px",
      color: "#FFFFFF"
    });
    valueLabel.setScrollFactor(0);

    return {
      fill: barFill,
      valueLabel,
      maxWidth: 156
    };
  }

  private setupCustomizationPanel(uiWidth: number): void {
    this.customPanel = this.add.container(0, 0);
    this.customPanel.setScrollFactor(0);
    this.customPanel.setDepth(2);

    const panelBg = this.add.rectangle(this.uiStartX + 20, 500, uiWidth - 40, 200, 0x1c1c3a, 0.95);
    panelBg.setOrigin(0, 0);
    panelBg.setStrokeStyle(2, 0xffd700);
    panelBg.setScrollFactor(0);
    this.customPanel.add(panelBg);

    const hairLabel = this.add.text(this.uiStartX + 30, 520, "Hair Color", {
      fontSize: "14px",
      color: "#FFFFFF"
    });
    hairLabel.setScrollFactor(0);
    this.customPanel.add(hairLabel);

    const hairColors = [0x8b4513, 0x000000, 0xffd700, 0xff6347];
    hairColors.forEach((color, index) => {
      const colorBtn = this.add.rectangle(this.uiStartX + 30 + index * 40, 545, 28, 28, color, 1);
      colorBtn.setStrokeStyle(2, 0xffffff);
      colorBtn.setScrollFactor(0);
      colorBtn.setInteractive({ useHandCursor: true });
      colorBtn.on("pointerdown", () => this.changeHairColor(color));
      this.customPanel.add(colorBtn);
      this.hairButtons.push(colorBtn);
    });

    const skinLabel = this.add.text(this.uiStartX + 30, 585, "Skin Tone", {
      fontSize: "14px",
      color: "#FFFFFF"
    });
    skinLabel.setScrollFactor(0);
    this.customPanel.add(skinLabel);

    const skinColors = [0xffb6c1, 0xf5deb3, 0xdeb887, 0x8b4513];
    skinColors.forEach((color, index) => {
      const colorBtn = this.add.rectangle(this.uiStartX + 30 + index * 40, 610, 28, 28, color, 1);
      colorBtn.setStrokeStyle(2, 0xffffff);
      colorBtn.setScrollFactor(0);
      colorBtn.setInteractive({ useHandCursor: true });
      colorBtn.on("pointerdown", () => this.changeSkinColor(color));
      this.customPanel.add(colorBtn);
      this.skinButtons.push(colorBtn);
    });

    const shirtLabel = this.add.text(this.uiStartX + 30, 650, "Shirt Color", {
      fontSize: "14px",
      color: "#FFFFFF"
    });
    shirtLabel.setScrollFactor(0);
    this.customPanel.add(shirtLabel);

    const shirtColors = [0x4169e1, 0xff0000, 0x32cd32, 0x800080];
    shirtColors.forEach((color, index) => {
      const colorBtn = this.add.rectangle(this.uiStartX + 30 + index * 40, 675, 28, 28, color, 1);
      colorBtn.setStrokeStyle(2, 0xffffff);
      colorBtn.setScrollFactor(0);
      colorBtn.setInteractive({ useHandCursor: true });
      colorBtn.on("pointerdown", () => this.changeShirtColor(color));
      this.customPanel.add(colorBtn);
      this.shirtButtons.push(colorBtn);
    });

    this.customPanel.setVisible(false);
    this.customPanel.list.forEach((child) => {
      child.active = false;
    });

    this.updateColorSelection(this.hairButtons, this.playerData.hairColor);
    this.updateColorSelection(this.skinButtons, this.playerData.skinColor);
    this.updateColorSelection(this.shirtButtons, this.playerData.shirtColor);
  }

  private setupPlayer(): void {
    const scaleHeight = this.getScaleHeight();
    this.player = this.physics.add.sprite(120, scaleHeight - 120, "player");
    this.player.setBounce(0.2);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(2);
    this.physics.add.collider(this.player, this.platforms);
  }

  private setupInteractables(): void {
    this.interactables = this.physics.add.staticGroup();

    const groundY = this.getScaleHeight() - 50;
    const items: Array<{ x: number; y: number; key: string }> = [
      { x: 280, y: groundY, key: "tree" },
      { x: 520, y: groundY, key: "chest" },
      { x: 760, y: groundY, key: "crystal" },
      { x: 1020, y: groundY, key: "tree" },
      { x: 1260, y: groundY, key: "chest" }
    ];

    items.forEach(({ x, y, key }) => {
      const sprite = this.interactables.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
      sprite.setOrigin(0.5, 1);
      sprite.refreshBody();
      sprite.setDepth(1);
    });

    this.physics.add.collider(this.interactables, this.platforms);

    this.physics.add.overlap(
      this.player,
      this.interactables,
      (_player, object) => {
        this.handleInteraction(object as Phaser.Physics.Arcade.Sprite);
      },
      undefined,
      this
    );

    this.interactionText = this.add.text(0, 0, "", {
      fontSize: "16px",
      color: "#FFFF00",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    });
    this.interactionText.setVisible(false);
    this.interactionText.setDepth(5);
  }

  private setupControls(): void {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D
    }) as {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    };

    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.interactKey.on("down", () => {
      if (this.nearObject) {
        this.interactWithObject(this.nearObject);
      }
    });
  }

  private setupCamera(): void {
    this.cameras.main.setBounds(0, 0, this.gameAreaWidth + 400, this.getScaleHeight());
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(120, 80);
  }

  private toggleCustomization(): void {
    this.isCustomizing = !this.isCustomizing;
    this.customPanel.setVisible(this.isCustomizing);
    this.customPanel.list.forEach((child) => {
      child.active = this.isCustomizing;
    });
    this.customButtonText.setText(this.isCustomizing ? "Close" : "Customize");
  }

  private changeHairColor(color: number): void {
    if (this.playerData.hairColor === color) {
      return;
    }
    this.playerData.hairColor = color;
    this.updateColorSelection(this.hairButtons, color);
    this.updateCharacterAppearance();
  }

  private changeSkinColor(color: number): void {
    if (this.playerData.skinColor === color) {
      return;
    }
    this.playerData.skinColor = color;
    this.updateColorSelection(this.skinButtons, color);
    this.updateCharacterAppearance();
  }

  private changeShirtColor(color: number): void {
    if (this.playerData.shirtColor === color) {
      return;
    }
    this.playerData.shirtColor = color;
    this.updateColorSelection(this.shirtButtons, color);
    this.updateCharacterAppearance();
  }

  private updateColorSelection(buttons: Phaser.GameObjects.Rectangle[], selectedColor: number): void {
    buttons.forEach((button) => {
      const strokeColor = button.fillColor === selectedColor ? 0xffd700 : 0xffffff;
      button.setStrokeStyle(2, strokeColor);
    });
  }

  private updateCharacterAppearance(): void {
    this.refreshPlayerTexture();
    this.drawPortrait();
  }

  private refreshPlayerTexture(): void {
    const textureKey = "player-custom";
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey);
    }

    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(this.playerData.shirtColor, 1);
    graphics.fillRoundedRect(4, 16, 16, 14, 4);

    graphics.fillStyle(this.playerData.skinColor, 1);
    graphics.fillRoundedRect(6, 6, 12, 12, 6);

    graphics.fillStyle(this.playerData.hairColor, 1);
    graphics.fillCircle(12, 6, 8);

    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(9, 12, 1.2);
    graphics.fillCircle(15, 12, 1.2);

    graphics.generateTexture(textureKey, 24, 32);
    graphics.destroy();

    this.player.setTexture(textureKey);
    this.player.setSize(24, 32);
    this.player.setOffset(0, 0);
  }

  private drawPortrait(): void {
    const centerX = this.uiStartX + this.uiRect.width / 2;
    const topY = 40;

    this.portraitGraphics.clear();

    this.portraitGraphics.fillStyle(0x252544, 1);
    this.portraitGraphics.fillRoundedRect(centerX - 70, topY - 10, 140, 160, 18);

    this.portraitGraphics.fillStyle(this.playerData.shirtColor, 1);
    this.portraitGraphics.fillRoundedRect(centerX - 60, topY + 80, 120, 70, 24);

    this.portraitGraphics.fillStyle(this.playerData.skinColor, 1);
    this.portraitGraphics.fillCircle(centerX, topY + 70, 45);

    this.portraitGraphics.fillStyle(this.playerData.hairColor, 1);
    this.portraitGraphics.fillCircle(centerX, topY + 30, 55);
    this.portraitGraphics.fillCircle(centerX - 34, topY + 56, 18);
    this.portraitGraphics.fillCircle(centerX + 34, topY + 56, 18);

    this.portraitGraphics.fillStyle(0x000000, 1);
    this.portraitGraphics.fillCircle(centerX - 18, topY + 60, 6);
    this.portraitGraphics.fillCircle(centerX + 18, topY + 60, 6);

    this.portraitGraphics.fillStyle(0xffa07a, 1);
    this.portraitGraphics.fillEllipse(centerX, topY + 92, 30, 12);
  }

  private handleInteraction(object: Phaser.Physics.Arcade.Sprite): void {
    if (this.nearObject === object) {
      return;
    }

    this.nearObject = object;
    this.interactionText.setText("Press SPACE");
    this.interactionText.setVisible(true);
    this.interactionText.setPosition(
      object.x - object.displayWidth * 0.5,
      object.y - object.displayHeight - 16
    );
  }

  private interactWithObject(object: Phaser.Physics.Arcade.Sprite): void {
    let message = "";
    const objectType = object.texture.key;

    switch (objectType) {
      case "tree":
        message = "You found some berries! +5 HP";
        this.playerData.hp = Math.min(this.playerData.hp + 5, this.playerData.maxHp);
        break;
      case "chest":
        message = "Treasure! +50 EXP";
        this.playerData.exp = Math.min(this.playerData.exp + 50, this.playerData.maxExp);
        if (this.playerData.exp >= this.playerData.maxExp) {
          this.levelUp();
        }
        break;
      case "crystal":
        message = "Magic crystal! +10 MP";
        this.playerData.mp = Math.min(this.playerData.mp + 10, this.playerData.maxMp);
        break;
      default:
        break;
    }

    this.showMessage(message);
    object.destroy();
    this.nearObject = undefined;
    this.interactionText.setVisible(false);
    this.updateUI();
  }

  private levelUp(): void {
    this.playerData.level += 1;
    this.playerData.rank = this.playerData.level >= 20 ? "Elite" : "Adventurer";
    this.playerData.exp = 0;
    this.playerData.maxExp += 200;
    this.playerData.maxHp += 10;
    this.playerData.maxMp += 5;
    this.playerData.hp = Math.min(this.playerData.hp + 10, this.playerData.maxHp);
    this.playerData.mp = Math.min(this.playerData.mp + 5, this.playerData.maxMp);
    this.showMessage(`Level Up! Now level ${this.playerData.level}!`);
  }

  private showMessage(text: string): void {
    const message = this.add.text(this.player.x, this.player.y - 70, text, {
      fontSize: "14px",
      color: "#FFFF00",
      backgroundColor: "#000000",
      padding: { x: 6, y: 4 }
    });
    message.setOrigin(0.5);
    message.setDepth(5);

    this.tweens.add({
      targets: message,
      y: message.y - 40,
      alpha: 0,
      duration: 2200,
      ease: "Sine.easeIn",
      onComplete: () => message.destroy()
    });
  }

  update(): void {
    if (!this.player) {
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = 200;

    this.player.setVelocityX(0);

    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
    }

    if ((this.cursors.up.isDown || this.wasd.W.isDown) && body.blocked.down) {
      this.player.setVelocityY(-330);
    }

    if (this.nearObject) {
      if (!this.nearObject.active || !this.physics.overlap(this.player, this.nearObject)) {
        this.nearObject = undefined;
        this.interactionText.setVisible(false);
      } else {
        this.interactionText.setPosition(
          this.nearObject.x - this.nearObject.displayWidth * 0.5,
          this.nearObject.y - this.nearObject.displayHeight - 16
        );
      }
    }

    this.updateUI();
  }

  private updateUI(): void {
    this.nameText.setText(`Name: ${this.playerData.name}`);
    this.levelText.setText(`Level: ${this.playerData.level}`);
    this.rankText.setText(`Rank: ${this.playerData.rank}`);

    this.updateStatBar("hp", this.playerData.hp, this.playerData.maxHp);
    this.updateStatBar("mp", this.playerData.mp, this.playerData.maxMp);
    this.updateStatBar("exp", this.playerData.exp, this.playerData.maxExp);
  }

  private updateStatBar(stat: StatKey, current: number, max: number): void {
    const bar = this.statBars[stat];
    const ratio = Phaser.Math.Clamp(max === 0 ? 0 : current / max, 0, 1);
    bar.fill.displayWidth = ratio * bar.maxWidth;
    bar.valueLabel.setText(`${current}/${max}`);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#1A1A28",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 300 },
      debug: false
    }
  },
  scene: [BootScene, GameScene]
};

export const game = new Phaser.Game(config);

window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
