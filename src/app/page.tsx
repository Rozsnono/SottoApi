import { redirect } from "next/navigation";

/** A gyökér az admin felületre irányít (a mobil app az /api végpontokat használja). */
export default function Home() {
  redirect("/admin");
}
