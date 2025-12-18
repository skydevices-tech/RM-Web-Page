import { defineConfig } from 'vite';


export default defineConfig({
    publicDir: 'public',
    root: './src',
    build: {
        outDir: '../dist',
        emptyOutDir: true, // also necessary
        target: "esnext",
        modulePreload: false
    },
    server: {
        port: 7700
    }
});