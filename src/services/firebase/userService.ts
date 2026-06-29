import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppUser } from "@/lib/data";

const COLLECTION_NAME = "users";

export const userService = {
  /**
   * Obtém todos os usuários do sistema.
   */
  async getAll(): Promise<AppUser[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const data: AppUser[] = [];
    querySnapshot.forEach((docSnap) => {
      data.push({ uid: docSnap.id, ...docSnap.data() } as AppUser);
    });
    return data;
  },

  /**
   * Obtém um usuário por ID (UID).
   */
  async getById(uid: string): Promise<AppUser | null> {
    const docRef = doc(db, COLLECTION_NAME, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { uid: docSnap.id, ...docSnap.data() } as AppUser;
    }
    return null;
  },

  /**
   * Atualiza as permissões/dados de um usuário existente.
   */
  async update(uid: string, data: Partial<AppUser>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, uid);
    await updateDoc(docRef, data);
  },

  /**
   * Remove um registro de usuário do banco de dados 
   * (Nota: isso não exclui do Firebase Auth automaticamente).
   */
  async remove(uid: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, uid);
    await deleteDoc(docRef);
  }
};
