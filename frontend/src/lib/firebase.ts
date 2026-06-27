import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCrLReSFkJjT97hsg9Ls6b2-r8AFdp0pxc",
  authDomain: "wrc2025-b1cce.firebaseapp.com",
  projectId: "wrc2025-b1cce",
  storageBucket: "wrc2025-b1cce.firebasestorage.app",
  messagingSenderId: "837386632950",
  appId: "1:837386632950:web:0ab1f62b7dcbf36ef3b6d7",
  measurementId: "G-Y12L98QCTH",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
