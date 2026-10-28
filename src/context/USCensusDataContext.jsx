import { createContext, useContext } from "react";
import { useUSCensusData } from "../hooks/useUSCensusData.js";

const USCensusDataContext = createContext(null);

export function USCensusDataProvider({ children }) {
  const data = useUSCensusData();
  return <USCensusDataContext.Provider value={data}>{children}</USCensusDataContext.Provider>;
}

export function useUSCensusDataContext() {
  return useContext(USCensusDataContext) ?? { liveData: null, fetchStatus: "idle" };
}
