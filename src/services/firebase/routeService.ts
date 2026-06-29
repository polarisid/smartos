import { collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc, writeBatch, query, where, orderBy, limit, startAfter, Timestamp, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Route } from "@/lib/data";

const COLLECTION_NAME = "routes";

export const routeService = {
  /**
   * Obtém todas as rotas com suporte a paginação simples.
   */
  async getRoutesPaginated(pageSize: number = 20, lastDoc?: QueryDocumentSnapshot<DocumentData>): Promise<{ routes: Route[], lastVisible: QueryDocumentSnapshot<DocumentData> | null }> {
    let q = query(
      collection(db, COLLECTION_NAME),
      orderBy("createdAt", "desc"),
      limit(pageSize)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const querySnapshot = await getDocs(q);
    const routes: Route[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      routes.push({
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
        departureDate: data.departureDate instanceof Timestamp ? data.departureDate.toDate() : data.departureDate,
        arrivalDate: data.arrivalDate instanceof Timestamp ? data.arrivalDate.toDate() : data.arrivalDate,
      } as Route);
    });

    const lastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

    return { routes, lastVisible };
  },

  /**
   * Obtém todas as rotas ativas.
   */
  async getActiveRoutes(): Promise<Route[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("isActive", "==", true),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    const routes: Route[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      routes.push({
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
        departureDate: data.departureDate instanceof Timestamp ? data.departureDate.toDate() : data.departureDate,
        arrivalDate: data.arrivalDate instanceof Timestamp ? data.arrivalDate.toDate() : data.arrivalDate,
      } as Route);
    });
    return routes;
  },

  /**
   * Obtém rotas inativas com paginação e filtro por data.
   */
  async getInactiveRoutesPaginated(pageSize: number, startDate?: Date, lastDoc?: QueryDocumentSnapshot<DocumentData>): Promise<{ routes: Route[], lastVisible: QueryDocumentSnapshot<DocumentData> | null }> {
    let constraints: any[] = [
        where("isActive", "==", false),
        orderBy("createdAt", "desc")
    ];

    if (startDate) {
        constraints.push(where("createdAt", ">=", startDate));
    }

    constraints.push(limit(pageSize));

    if (lastDoc) {
        constraints.push(startAfter(lastDoc));
    }

    const q = query(collection(db, COLLECTION_NAME), ...constraints);
    const querySnapshot = await getDocs(q);
    
    const routes: Route[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      routes.push({
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
        departureDate: data.departureDate instanceof Timestamp ? data.departureDate.toDate() : data.departureDate,
        arrivalDate: data.arrivalDate instanceof Timestamp ? data.arrivalDate.toDate() : data.arrivalDate,
      } as Route);
    });

    const lastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

    return { routes, lastVisible };
  },

  /**
   * Cria uma nova rota.
   */
  async create(routeData: Omit<Route, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), routeData);
    return docRef.id;
  },

  /**
   * Atualiza uma rota existente.
   */
  async update(id: string, data: Partial<Route>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, data);
  },

  /**
   * Finaliza uma rota.
   */
  async finishRoute(id: string, arrivalDate: Date): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      isActive: false,
      arrivalDate: arrivalDate
    });
  },

  /**
   * Remove (exclui) uma rota.
   */
  async remove(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  },

  /**
   * Atualização em lote.
   */
  async updateBatch(updates: { id: string; data: Partial<Route> }[]): Promise<void> {
    const batch = writeBatch(db);
    updates.forEach((update) => {
      const docRef = doc(db, COLLECTION_NAME, update.id);
      batch.update(docRef, update.data);
    });
    await batch.commit();
  }
};
