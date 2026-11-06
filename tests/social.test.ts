import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anyCtx, authH, befriend, clearDb, json, jsonReq, makeUser, startDb, stopDb, type TestUser } from "./helpers";
import { GET as searchRoute } from "@/app/api/users/search/route";
import { GET as friendsRoute } from "@/app/api/friends/route";
import { POST as requestRoute } from "@/app/api/friends/requests/route";
import { POST as actionRoute } from "@/app/api/friends/requests/[id]/[action]/route";
import { DELETE as unfriendRoute } from "@/app/api/friends/[userId]/route";
import { POST as blockRoute } from "@/app/api/blocks/route";
import { DELETE as unblockRoute } from "@/app/api/blocks/[userId]/route";
import { GET as convRoute } from "@/app/api/conversations/route";
import { Conversation, Friendship, User } from "@/models";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const search = async (u: TestUser, q: string) => (await json(await searchRoute(jsonReq(`/api/users/search?q=${q}`, "GET", undefined, authH(u)), anyCtx()))).body.data.items as { username: string; relation: string }[];
const request = (u: TestUser, username: string) => requestRoute(jsonReq("/api/friends/requests", "POST", { username }, authH(u)), anyCtx());
const list = async (u: TestUser) => (await json(await friendsRoute(jsonReq("/api/friends", "GET", undefined, authH(u)), anyCtx()))).body.data;
const act = (u: TestUser, id: string, action: string) => actionRoute(jsonReq(`/api/friends/requests/${id}/${action}`, "POST", {}, authH(u)), anyCtx({ id, action }));

describe("keresés", () => {
  it("a láthatósági szabályokat betartja (rejtett, csak ismerős, tiltott, önmaga, min. 3 karakter)", async () => {
    const me = await makeUser("andras");
    await makeUser("bela_public");
    const hidden = await makeUser("bela_hidden");
    const fo = await makeUser("bela_friends");
    const blocked = await makeUser("bela_blocked");
    await User.updateOne({ _id: hidden.userId }, { discoverability: "hidden" });
    await User.updateOne({ _id: fo.userId }, { discoverability: "friends_only" });
    await blockRoute(jsonReq("/api/blocks", "POST", { userId: blocked.userId }, authH(me)), anyCtx());
    expect((await search(me, "bel")).map((i) => i.username)).toEqual(["bela_public"]);
    expect(await search(me, "an")).toEqual([]);
    expect(await search(me, "andras")).toEqual([]); // önmaga nem
    // friends_only csak ismerősnek látszik
    await User.updateOne({ _id: fo.userId }, { friendRequestPolicy: "everyone" });
    await befriend(me, fo);
    expect((await search(me, "bela_f")).map((i) => i.relation)).toEqual(["friend"]);
    // a tiltott fél sem látja a tiltót
    expect(await search(blocked, "andr")).toEqual([]);
  });
  it("a keresés sebességkorlátos", async () => {
    const me = await makeUser("andras");
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await searchRoute(jsonReq("/api/users/search?q=abc", "GET", undefined, authH(me)), anyCtx())).status;
    expect(last).toBe(429);
  });
});

describe("ismeretség állapotgép", () => {
  it("kérés → függő → elfogadás → beszélgetés; idempotens ismétlés", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    expect((await json(await request(a, "bence"))).body.data.status).toBe("sent");
    await request(a, "BENCE"); // kisbetű/nagybetű + ismétlés
    expect(await Friendship.countDocuments()).toBe(1);
    const inc = (await list(b)).incoming;
    expect(inc).toHaveLength(1);
    expect((await list(a)).outgoing).toHaveLength(1);
    const acc = await json(await act(b, inc[0].friendshipId, "accept"));
    expect(acc.body.data.conversationId).toBeTruthy();
    expect((await list(a)).friends[0].user.username).toBe("bence");
    expect((await json(await request(a, "bence"))).body.data.status).toBe("already_friends");
  });

  it("kölcsönös kérés automatikusan elfogadódik", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    await request(a, "bence");
    const res = await json(await request(b, "anna"));
    expect(res.body.data.status).toBe("accepted");
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it("csak a címzett fogadhat el/utasíthat el, csak a kérelmező vonhatja vissza", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    await request(a, "bence");
    const id = String((await Friendship.findOne())!._id);
    expect((await act(a, id, "accept")).status).toBe(403);
    expect((await act(b, id, "cancel")).status).toBe(403);
    expect((await act(a, id, "cancel")).status).toBe(200);
    expect((await act(b, id, "accept")).status).toBe(409); // már lezárt
  });

  it("törlés archivál; az újra-jelölés ugyanazt a beszélgetést aktiválja újra", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    const conv = await befriend(a, b);
    expect((await unfriendRoute(jsonReq(`/api/friends/${b.userId}`, "DELETE", undefined, authH(a)), anyCtx({ userId: b.userId }))).status).toBe(200);
    expect((await Conversation.findById(conv))!.archived).toBe(true);
    expect((await Friendship.findOne())!.status).toBe("archived");
    await request(b, "anna"); // re-friend
    const f = await Friendship.findOne();
    expect(f!.status).toBe("pending");
    const acc = await json(await act(a, String(f!._id), "accept"));
    expect(acc.body.data.conversationId).toBe(conv);
    expect((await Conversation.findById(conv))!.archived).toBe(false);
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it("tiltás, rejtett fiók és korlátozó beállítás esetén általános 'sent', de nem jön létre kérés", async () => {
    const a = await makeUser("anna");
    const hidden = await makeUser("rejtett");
    const strict = await makeUser("szigoru");
    const blocker = await makeUser("tilto");
    await User.updateOne({ _id: hidden.userId }, { discoverability: "hidden" });
    await User.updateOne({ _id: strict.userId }, { friendRequestPolicy: "friends_only" });
    await blockRoute(jsonReq("/api/blocks", "POST", { userId: a.userId }, authH(blocker)), anyCtx());
    for (const n of ["rejtett", "szigoru", "tilto", "nincsilyen"]) {
      expect((await json(await request(a, n))).body.data.status).toBe("sent");
    }
    expect(await Friendship.countDocuments()).toBe(0);
  });

  it("a kérések száma korlátos (10/perc)", async () => {
    const a = await makeUser("anna");
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request(a, `nincs${i}`)).status;
    expect(last).toBe(429);
  });
});

describe("tiltás", () => {
  it("megszünteti az ismeretséget, archiválja a beszélgetést, a feloldás nem állítja vissza", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    const conv = await befriend(a, b);
    expect((await blockRoute(jsonReq("/api/blocks", "POST", { userId: b.userId }, authH(a)), anyCtx())).status).toBe(200);
    expect((await Friendship.findOne())!.status).toBe("archived");
    expect((await Conversation.findById(conv))!.archived).toBe(true);
    await unblockRoute(jsonReq(`/api/blocks/${b.userId}`, "DELETE", undefined, authH(a)), anyCtx({ userId: b.userId }));
    expect((await Friendship.findOne())!.status).toBe("archived");
  });
  it("önmagát nem lehet letiltani", async () => {
    const a = await makeUser("anna");
    expect((await blockRoute(jsonReq("/api/blocks", "POST", { userId: a.userId }, authH(a)), anyCtx())).status).toBe(400);
  });
});

describe("beszélgetések", () => {
  it("az elérhetetlen (törlésre váró) másik fél neve nem kerül ki, a beszélgetés archivált", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    await befriend(a, b);
    await User.updateOne({ _id: b.userId }, { status: "deleted_pending", deletedAt: new Date() });
    const res = await json(await convRoute(jsonReq("/api/conversations", "GET", undefined, authH(a)), anyCtx()));
    expect(res.body.data.items[0].other.username).toBeNull();
    expect(res.body.data.items[0].archived).toBe(true);
    expect(res.body.data.items[0].available).toBe(false);
  });
});
