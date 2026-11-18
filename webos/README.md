# IPTV Player Pro — LG webOS 3.0 test app

This folder is an isolated webOS TV package for the 2016 LG 49UH650V (webOS 3.0).
It does not alter the Android application or its build.

## Current milestone

- webOS app metadata and TV-first 1080p layout
- ES5 JavaScript (no ES modules, optional chaining, or modern bundler runtime)
- Remote navigation using arrow, OK/Enter, and Back/Escape keys
- M3U playlist loading over HTTP(S)
- Native HTML5 video playback attempt for TV-supported stream formats
- One public HLS test stream for initial playback checks

This is a hardware compatibility prototype, not the full IPTV Player Pro feature set.
HLS, MPEG-TS, authentication headers, Xtream Codes, EPG, subtitles, and codec support must be validated separately on the physical TV.

## Package and install

Install the current LG webOS CLI / webOS Studio from the official LG Developer site.
Then, from the repository root:

```bash
ares-package ./webos
ares-setup-device
ares-install --device <configured-device> ./com.sedonet.iptvplayerpro_0.1.0_all.ipk
ares-launch --device <configured-device> com.sedonet.iptvplayerpro
```

The exact device setup and Developer Mode availability must be confirmed on the 49UH650V before relying on local IPK installation.

## Compatibility notes

The 49UH650V is specified by LG as webOS 3.0. webOS 3.x uses Chromium 38, so this prototype deliberately avoids ES modules and modern JavaScript syntax. The existing Android app remains the source of truth; this is a separate TV client that will reuse compatible parsing and catalog logic only after a suitable legacy build strategy is established.

## Next steps

1. Confirm Developer Mode can be installed and activated on the TV.
2. Install this minimal IPK and verify remote keys and focus.
3. Test a public HLS stream and a user-authorized M3U playlist.
4. Add the app's source/account flow and port the live-channel catalog.
5. Validate Xtream, EPG, audio/subtitle tracks, and playback reliability.
6. Prepare LG Seller Lounge assets, UX scenario, and self-checklist after device QA.
