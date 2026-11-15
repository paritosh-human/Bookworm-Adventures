import Phaser from 'phaser';

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
  const bg = scene.add
    .rectangle(x, y, width, height, 0x3b2a1a)
    .setStrokeStyle(2, 0xd4af37)
    .setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(x, y, label, {
      fontFamily: 'Georgia, serif',
      fontSize: '18px',
      color: '#f2e6c9',
    })
    .setOrigin(0.5);

  bg.on('pointerover', () => bg.setFillStyle(0x543c24));
  bg.on('pointerout', () => bg.setFillStyle(0x3b2a1a));
  bg.on('pointerdown', () => {
    if (scene.cache.audio.exists('buttonclick')) scene.sound.play('buttonclick');
    onClick();
  });

  return { bg, text };
}
