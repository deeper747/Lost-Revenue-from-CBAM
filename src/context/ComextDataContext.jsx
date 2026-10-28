import { createContext, useContext } from "react";
import { useComextLiveData } from "../hooks/useComextLiveData.js";

const ComextDataContext = createContext(null);

export function ComextDataProvider({ children }) {
  const data = useComextLiveData();
  return <ComextDataContext.Provider value={data}>{children}</ComextDataContext.Provider>;
}

export function useComextData() {
  return useContext(ComextDataContext) ?? { liveData: null, fetchStatus: "idle" };
}
