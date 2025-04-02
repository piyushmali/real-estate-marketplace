import { getProperties } from "@/lib/db";

export const useProperties = () => {
  const fetchProperties = async () => {
    const properties = await getProperties();
    return properties;
  };
  return { fetchProperties };
};