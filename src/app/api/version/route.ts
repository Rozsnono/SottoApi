import { handle, ok } from "@/lib/http";
import pkg from "../../../../package.json";

/** Az API verziója (nyilvános, nem érzékeny): az app a Beállításokban megmutatja. */
export const GET = handle(async () => ok({ version: pkg.version }));
