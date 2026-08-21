/** Lets Vite bundle text-based research data as a server-side string. */
declare module "*.csv?raw" {
  const contents: string;
  export default contents;
}
