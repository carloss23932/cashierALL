import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

type Client = {
  id: string;
  name: string;
  phone?: string;
  debt: number;
  createdAt: string;
  paidAt?: string | null;
};

const FILE_PATH = path.join(process.cwd(), "data", "clients.json");

function ensureStore() {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, "[]", "utf8");
}

function readClients(): Client[] {
  ensureStore();
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Client[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeClients(clients: Client[]) {
  ensureStore();
  fs.writeFileSync(FILE_PATH, JSON.stringify(clients, null, 2), "utf8");
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json(readClients());
  }

  if (req.method === "POST") {
    const { name, phone, debt } = req.body as Partial<Client>;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const clients = readClients();
    const newClient: Client = {
      id: String(Date.now()),
      name: name.trim(),
      phone: (phone || "").toString(),
      debt: typeof debt === "number" && !Number.isNaN(debt) ? debt : 0,
      createdAt: new Date().toISOString(),
      paidAt: null,
    };
    clients.push(newClient);
    writeClients(clients);
    return res.status(201).json(newClient);
  }

  if (req.method === "PUT") {
    const { id, action } = req.body as { id?: string; action?: string };
    if (!id) return res.status(400).json({ error: "id required" });

    const clients = readClients();
    const idx = clients.findIndex((c) => c.id === id);
    if (idx === -1) return res.status(404).json({ error: "client not found" });

    if (action === "pay") {
      clients[idx].debt = 0;
      clients[idx].paidAt = new Date().toISOString();
      writeClients(clients);
      return res.status(200).json(clients[idx]);
    }

    return res.status(400).json({ error: "unknown action" });
  }

  res.setHeader("Allow", ["GET", "POST", "PUT"]);
  return res.status(405).json({ error: "Method not allowed" });
}
