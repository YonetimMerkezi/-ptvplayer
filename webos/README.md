# IPTV Player Pro — LG webOS TV

This folder contains the isolated LG webOS TV client for the 2016 LG 49UH650V / webOS 3.x target. Android application files and build configuration are kept separate.

## Current UI milestone — 0.2.0

- Hybrid premium TV dashboard with a dark green visual system
- TV-first 1920x1080 layout, large typography and clear remote focus states
- Restyled source dialog, channel cards and video player overlays
- Existing JavaScript control and playback flow retained unchanged
- ES5 / Chromium 38 compatible styling and markup; no modern framework runtime added

## Existing playback and remote behavior

The current client continues to use the existing M3U loader, parser, localStorage source restore, HTML5 video playback, channel controls and keydown navigation. The redesign intentionally preserves the existing element IDs and JavaScript file so the visual work does not replace the working remote or playback implementation.

## Performance approach

- Keep the TV interface mostly static; avoid large animated scenes and continuously running effects
- Use CSS gradients and simple shapes instead of loading decorative image assets
- Keep the video element and playback lifecycle unchanged
- Validate actual frame rate, memory use, channel switching and long-play stability on the physical TV

No performance benchmark or physical-device QA is claimed by this commit. The new UI still requires testing on the LG 49UH650V.

## Package and install

Install the current LG webOS CLI / webOS Studio from the official LG Developer site. From the repository root:

```bash
ares-package ./webos
ares-setup-device
ares-install --device <configured-device> ./com.sedonet.iptvplayerpro_0.2.0_all.ipk
ares-launch --device <configured-device> com.sedonet.iptvplayerpro
```

The exact package filename should be confirmed from the CLI output. Developer Mode and device connectivity must be available on the TV.

## Compatibility notes

The target is webOS 3.x / Chromium 38. Keep JavaScript ES5-compatible and avoid ES modules, optional chaining, async/await, and modern bundler output in this isolated webOS client. Stream compatibility remains dependent on the TV's supported codecs, containers, HLS profile and provider behavior.

## Next validation

1. Install the updated IPK on the LG 49UH650V.
2. Check the home screen at the TV's native resolution and confirm no clipping.
3. Test every remote direction, OK, Back, source dialog focus and player controls.
4. Compare startup, list load and channel-change responsiveness with the previous build.
5. Run a longer playback session and check memory stability before adding further features.
