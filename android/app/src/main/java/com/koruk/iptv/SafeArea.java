package com.koruk.iptv;

/**
 * Kamera çentiği payı (piksel: sol, üst, sağ, alt). MainActivity yazar, eklenti okuyup sayfaya iletir.
 */
final class SafeArea {
    interface Listener {
        void onChange(int[] px);
    }

    private static volatile int[] px = new int[4];
    private static volatile Listener listener;

    private SafeArea() {}

    static int[] get() {
        return px;
    }

    static void set(int l, int t, int r, int b) {
        int[] cur = px;
        if (cur[0] == l && cur[1] == t && cur[2] == r && cur[3] == b) return;
        px = new int[] {l, t, r, b};
        Listener f = listener;
        if (f != null) f.onChange(px);
    }

    static void listen(Listener f) {
        listener = f;
    }
}
