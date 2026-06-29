import { collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Driver } from "@/lib/data";

const COLLECTION_NAME = "drivers";

export const driverService = {
  /**
   * Obtém todos os motoristas.
   */
  async getAll(): Promise<Driver[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const data: Driver[] = [];
    querySnapshot.forEach((docSnap) => {
      data.push({ id: docSnap.id, ...docSnap.data() } as Driver);
    });
    return data;
  },

  /**
   * Obtém um motorista por ID.
   */
  async getById(id: string): Promise<Driver | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Driver;
    }
    return null;
  },

  /**
   * Adiciona um novo motorista.
   */
  async create(driver: Omit<Driver, 'id'>, id?: string): Promise<string> {
    if (id) {
        const docRef = doc(db, COLLECTION_NAME, id);
        await setDoc(docRef, driver);
        return id;
    } else {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), driver);
        return docRef.id;
    }
  },

  /**
   * Atualiza um motorista.
   */
  async update(id: string, data: Partial<Driver>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, data);
  },

  /**
   * Remove um motorista.
   */
  async remove(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};
