import { initializeApp } from "firebase/app";
import { browserSessionPersistence, getAuth, setPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBq-S5yBhq4ofJWjYvc1y4EH4SXRnXpZPc",
  authDomain: "steadystride-e85b4.firebaseapp.com",
  projectId: "steadystride-e85b4",
  storageBucket: "steadystride-e85b4.firebasestorage.app",
  messagingSenderId: "752780860950",
  appId: "1:752780860950:web:0267063825ea9a11499f37",
  measurementId: "G-L8F2VXDYJC",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);

setPersistence(firebaseAuth, browserSessionPersistence).catch(() => {});
