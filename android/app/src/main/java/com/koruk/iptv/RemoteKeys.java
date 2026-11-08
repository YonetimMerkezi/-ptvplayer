package com.koruk.iptv;

import android.view.KeyEvent;

/**
 * TV kumandasının WebView'e olduğu gibi ulaşmayan tuşları (kanal +/-, medya, menü, renkli tuşlar).
 * MainActivity tuşu yakalar, eklenti sayfaya "remote" olayı olarak iletir.
 */
final class RemoteKeys {
    interface Listener {
        void onKey(String name);
    }

    private static volatile Listener listener;

    private RemoteKeys() {}

    static void listen(Listener f) {
        listener = f;
    }

    /** Tuşun sayfadaki (KeyboardEvent.key) adı; tanınmayan tuş için null. */
    static String nameOf(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_CHANNEL_UP: return "ChannelUp";
            case KeyEvent.KEYCODE_CHANNEL_DOWN: return "ChannelDown";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "MediaPlay";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "MediaPause";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "MediaPlayPause";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return "MediaFastForward";
            case KeyEvent.KEYCODE_MEDIA_REWIND: return "MediaRewind";
            case KeyEvent.KEYCODE_MEDIA_NEXT: return "MediaTrackNext";
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: return "MediaTrackPrevious";
            case KeyEvent.KEYCODE_MEDIA_STOP: return "MediaStop";
            case KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD: return "MediaSkipForward";
            case KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD: return "MediaSkipBackward";
            case KeyEvent.KEYCODE_CAPTIONS: return "Captions";
            case KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK: return "AudioTrack";
            case KeyEvent.KEYCODE_MENU: return "ContextMenu";
            case KeyEvent.KEYCODE_INFO: return "Info";
            case KeyEvent.KEYCODE_GUIDE: return "Guide";
            case KeyEvent.KEYCODE_PROG_RED: return "ColorF0Red";
            case KeyEvent.KEYCODE_PROG_GREEN: return "ColorF1Green";
            case KeyEvent.KEYCODE_PROG_YELLOW: return "ColorF2Yellow";
            case KeyEvent.KEYCODE_PROG_BLUE: return "ColorF3Blue";
            default: return null;
        }
    }

    /** Sayfa dinliyorsa tuşu iletir ve true döner (tuş tüketilir). */
    static boolean send(String name) {
        Listener f = listener;
        if (f == null) return false;
        f.onKey(name);
        return true;
    }
}
