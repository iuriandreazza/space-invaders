/** Cabinet look: pure black space, neon invaders, an orange-red laser rig and a cold blue ink for the hints. */
export const COLORS = {
  space: '#000000',
  starDim: '#3a4460',
  starMid: '#7b88a8',
  starBright: '#e4ecff',

  hudFrame: '#c0341c',
  hudText: '#ffb23a',
  hudAlert: '#ff3b2a',
  hudAlertDark: '#6a1410',
  energyFrame: '#8a2a14',
  energyTrack: '#1a0c08',
  energyHigh: '#3ddc5a',
  energyMedium: '#f4d03f',
  energyLow: '#ff4a2a',
  overheatText: '#ffffff',

  bunker: '#3df2c0',

  squid: '#ff4a5e',
  crab: '#37e6ff',
  octopus: '#a4ff3a',

  ufoDome: '#6fa0ff',
  ufoBody: '#ff4fd8',
  ufoLegs: '#9a3cff',

  bombHead: '#ffffff',
  bombTail: '#ff7ac0',

  cannon: '#ff8a1f',
  cannonHighlight: '#ffd36a',
  cannonShade: '#a8480c',
  wreck: '#5a4034',
  wreckShade: '#33241d',
  pipFull: '#ffcf2e',
  pipEmpty: '#3a2a22',
  protectLabel: '#4f7bff',

  novaCapsule: '#2f6bff',
  novaCapsuleBright: '#6f9aff',
  repairCapsule: '#22c55e',
  repairCapsuleBright: '#5ef08e',
  capsuleEdge: '#c8d6ff',
  capsuleLetter: '#ffffff',

  beamCore: ['#fff0d0', '#ffb060'],
  beamGlow: ['#a02810', '#7a1c0c'],

  reticle: '#ff5a2a',
  reticleFiring: '#ffb347',
  reticleCross: '#ff5a2a',
  reticleCrossFiring: '#fff2d0',
  reticleDim: '#6e2a1c',

  burst: ['#ffffff', '#ffd76a', '#ff8a3a', '#c02818'],
  bombBurst: ['#ffffff', '#ff9ec4'],
  ufoBurst: ['#ffffff', '#ff9aec', '#9a6cff', '#4a2c9a'],
  // Outermost layer first: the fireball goes out from the rim inwards.
  orangeFire: ['#601810', '#c02818', '#ff8a1f', '#ffd36a', '#fff8c0'],
  magentaFire: ['#3a1050', '#8a2a9a', '#ff4fd8', '#ff9aec', '#ffffff'],
  novaFlash: '#cfe0ff',
  novaRing: '#3b6bff',
  novaRingCore: '#dbe7ff',

  overlay: 'rgba(0, 0, 0, 0.6)',
  bannerTitle: '#ffd36a',
  bannerSubtitle: '#ffffff',
  bannerAlert: '#ff4a3a',
} as const;
