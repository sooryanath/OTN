import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  createDraft,
  directory,
  disputeElement,
  gstProjection,
  ledger,
  listMyDocuments,
  myParticipants,
  registerParticipant,
  respondFn,
  rotateKey,
  sendDocumentFn,
} from "@/lib/edi.functions";
import { formatINR } from "@/lib/canonical/totals";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/canonical/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app")({
  component: Dashboard,
});

const statusTone: Record<string, string> = {
  DRAFT: "secondary",
  SENT: "default",
  RECEIVED: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  MATCHED: "default",
  PENDING_COUNTERSIGN: "secondary",
  DISPUTED: "destructive",
};

function StatusBadge({ status }: { status: string }) {
  const variant = (statusTone[status] ?? "outline") as "default" | "secondary" | "destructive";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}

function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Trade Connect India</h1>
            <p className="text-xs text-muted-foreground">
              Signed document exchange · shared journal
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Tabs defaultValue="documents">
          <TabsList>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="ledger">Shared journal</TabsTrigger>
            <TabsTrigger value="registry">Registry</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-6">
            <DocumentsPanel />
          </TabsContent>
          <TabsContent value="compose" className="mt-6">
            <ComposePanel />
          </TabsContent>
          <TabsContent value="ledger" className="mt-6">
            <LedgerPanel />
          </TabsContent>
          <TabsContent value="registry" className="mt-6">
            <RegistryPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function useParticipants() {
  const fetchParticipants = useServerFn(myParticipants);
  return useQuery({ queryKey: ["participants"], queryFn: () => fetchParticipants() });
}

function RegistryPanel() {
  const queryClient = useQueryClient();
  const participants = useParticipants();
  const fetchDirectory = useServerFn(directory);
  const catalogue = useQuery({ queryKey: ["directory"], queryFn: () => fetchDirectory() });

  const register = useServerFn(registerParticipant);
  const rotate = useServerFn(rotateKey);

  const [form, setForm] = useState({
    gstin: "",
    legalName: "",
    tradeName: "",
    address: "",
    city: "",
    pincode: "",
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      register({
        data: {
          gstin: form.gstin.trim().toUpperCase(),
          legalName: form.legalName,
          ...(form.tradeName ? { tradeName: form.tradeName } : {}),
          address: form.address,
          city: form.city,
          pincode: form.pincode,
        },
      }),
    onSuccess: (result) => {
      toast.success(`Registered ${result.gstin} with key ${result.keyId}`);
      setForm({ gstin: "", legalName: "", tradeName: "", address: "", city: "", pincode: "" });
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rotateMutation = useMutation({
    mutationFn: (gstin: string) => rotate({ data: { gstin } }),
    onSuccess: (result) => {
      toast.success(`New signing key ${result.keyId}`);
      void queryClient.invalidateQueries({ queryKey: ["participants"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Register a GSTIN</CardTitle>
          <CardDescription>
            The exchange mints a P-256 key pair. The private half never leaves the server; only
            signatures travel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(
            [
              ["gstin", "GSTIN"],
              ["legalName", "Legal name"],
              ["tradeName", "Trade name (optional)"],
              ["address", "Address"],
              ["city", "City"],
              ["pincode", "PIN code"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <Button
            className="w-full"
            disabled={registerMutation.isPending}
            onClick={() => registerMutation.mutate()}
          >
            Register participant
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Your participants</CardTitle>
            <CardDescription>GSTINs you can sign as.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(participants.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing registered yet.</p>
            )}
            {(participants.data ?? []).map((p) => (
              <div
                key={p.gstin}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{p.legal_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.gstin}</p>
                  <p className="font-mono text-xs text-muted-foreground">key {p.key_id}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rotateMutation.isPending}
                  onClick={() => rotateMutation.mutate(p.gstin)}
                >
                  Rotate key
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Node directory</CardTitle>
            <CardDescription>Counterparties reachable on this node.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(catalogue.data ?? []).map((p) => (
              <div key={p.gstin} className="flex justify-between text-sm">
                <span>{p.legal_name}</span>
                <span className="font-mono text-xs text-muted-foreground">{p.gstin}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DocumentsPanel() {
  const queryClient = useQueryClient();
  const fetchDocs = useServerFn(listMyDocuments);
  const send = useServerFn(sendDocumentFn);
  const respond = useServerFn(respondFn);
  const project = useServerFn(gstProjection);
  const [projection, setProjection] = useState<string | null>(null);

  const docs = useQuery({ queryKey: ["documents"], queryFn: () => fetchDocs() });

  const act = useMutation({
    mutationFn: async (args: { id: string; action: "send" | "ACCEPTED" | "REJECTED" }) =>
      args.action === "send"
        ? send({ data: { id: args.id } })
        : respond({ data: { id: args.id, decision: args.action } }),
    onSuccess: () => {
      toast.success("Signed and recorded");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          Outbound documents are signed on send; inbound ones are verified against the sender's
          registered key before they land here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Counterparty</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(docs.data ?? []).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.documentNumber}</TableCell>
                <TableCell>{DOC_KIND_LABEL[d.kind as DocKind] ?? d.kind}</TableCell>
                <TableCell className="text-sm">
                  {d.direction === "OUTBOUND" ? d.buyerName : d.sellerName}
                  <span className="ml-2 text-xs text-muted-foreground">{d.direction}</span>
                </TableCell>
                <TableCell className="text-right">{formatINR(d.grandTotal)}</TableCell>
                <TableCell>
                  <StatusBadge status={d.status} />
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {d.direction === "OUTBOUND" && d.status === "DRAFT" && (
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: d.id, action: "send" })}
                    >
                      Sign &amp; send
                    </Button>
                  )}
                  {d.direction === "INBOUND" && d.status === "RECEIVED" && (
                    <>
                      <Button
                        size="sm"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: d.id, action: "ACCEPTED" })}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: d.id, action: "REJECTED" })}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const payload = await project({ data: { id: d.id } });
                      setProjection(JSON.stringify(payload, null, 2));
                    }}
                  >
                    GST JSON
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(docs.data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No documents yet — compose one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {projection && (
          <pre className="mt-6 max-h-80 overflow-auto rounded-md bg-foreground/5 p-4 text-xs">
            {projection}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function ComposePanel() {
  const queryClient = useQueryClient();
  const participants = useParticipants();
  const fetchDirectory = useServerFn(directory);
  const catalogue = useQuery({ queryKey: ["directory"], queryFn: () => fetchDirectory() });
  const create = useServerFn(createDraft);

  const [kind, setKind] = useState<DocKind>("INVOICE");
  const [sellerGstin, setSellerGstin] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [line, setLine] = useState({
    description: "",
    hsn: "",
    quantity: "1",
    unitPrice: "0",
    taxRate: "18",
  });

  const mine = participants.data ?? [];
  const others = (catalogue.data ?? []).filter((p) => !mine.some((m) => m.gstin === p.gstin));

  const submit = useMutation({
    mutationFn: async () => {
      const seller = mine.find((p) => p.gstin === sellerGstin);
      const buyer = (catalogue.data ?? []).find((p) => p.gstin === buyerGstin);
      if (!seller || !buyer) throw new Error("Pick both parties");

      return create({
        data: {
          id: crypto.randomUUID(),
          kind,
          documentNumber,
          issueDate: new Date().toISOString().slice(0, 10),
          currency: "INR",
          seller: {
            gstin: seller.gstin,
            legalName: seller.legal_name,
            stateCode: seller.state_code,
            address: seller.city,
            city: seller.city,
            pincode: "000000",
          },
          buyer: {
            gstin: buyer.gstin,
            legalName: buyer.legal_name,
            stateCode: buyer.state_code,
            address: buyer.city,
            city: buyer.city,
            pincode: "000000",
          },
          lines: [
            {
              id: crypto.randomUUID(),
              description: line.description,
              hsn: line.hsn,
              quantity: Number(line.quantity),
              uom: "NOS",
              unitPrice: Number(line.unitPrice),
              discount: 0,
              taxRate: Number(line.taxRate),
            },
          ],
          paymentTermsDays: 45,
        },
      });
    },
    onSuccess: () => {
      toast.success("Draft stored and content-hashed");
      setDocumentNumber("");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Compose a document</CardTitle>
        <CardDescription>
          Stored canonically and content-hashed. GST, e-way bill and ONDC payloads are projections
          of this record, never the source of truth.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Document kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as DocKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOC_KIND_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="docnum">Document number</Label>
            <Input
              id="docnum"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder="INV-2026-0001"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Seller (yours)</Label>
            <Select value={sellerGstin} onValueChange={setSellerGstin}>
              <SelectTrigger>
                <SelectValue placeholder="Select GSTIN" />
              </SelectTrigger>
              <SelectContent>
                {mine.map((p) => (
                  <SelectItem key={p.gstin} value={p.gstin}>
                    {p.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Buyer</Label>
            <Select value={buyerGstin} onValueChange={setBuyerGstin}>
              <SelectTrigger>
                <SelectValue placeholder="Select counterparty" />
              </SelectTrigger>
              <SelectContent>
                {others.map((p) => (
                  <SelectItem key={p.gstin} value={p.gstin}>
                    {p.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-5">
          {(
            [
              ["description", "Description"],
              ["hsn", "HSN"],
              ["quantity", "Qty"],
              ["unitPrice", "Rate"],
              ["taxRate", "GST %"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={line[key]}
                onChange={(e) => setLine({ ...line, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
          Save draft
        </Button>
      </CardContent>
    </Card>
  );
}

function LedgerPanel() {
  const queryClient = useQueryClient();
  const fetchLedger = useServerFn(ledger);
  const dispute = useServerFn(disputeElement);
  const journal = useQuery({ queryKey: ["ledger"], queryFn: () => fetchLedger() });

  const raise = useMutation({
    mutationFn: (elementId: string) =>
      dispute({ data: { elementId, reason: "Amount disputed by counterparty" } }),
    onSuccess: () => {
      toast.success("Dispute appended");
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const entries = journal.data?.entries ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shared journal</CardTitle>
        <CardDescription>
          One entry per trade, booked by both parties and countersigned. Status is derived from
          signatures and disputes — nothing here is editable.
        </CardDescription>
        <div className="pt-2">
          {journal.data && (
            <Badge variant={journal.data.chainOk ? "default" : "destructive"}>
              {journal.data.chainOk ? "Hash chain verified" : "Chain broken"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Narrative</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead>Signatures</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Chain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.sequence}</TableCell>
                <TableCell className="text-sm">{e.narrative}</TableCell>
                <TableCell className="text-right">{formatINR(e.amount)}</TableCell>
                <TableCell className="text-right">{formatINR(e.taxTotal)}</TableCell>
                <TableCell className="text-xs">{e.signers.length} of 2</TableCell>
                <TableCell>
                  <StatusBadge status={e.status} />
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.chainHash.slice(0, 10)}…
                  </span>
                  {e.status !== "DISPUTED" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={raise.isPending}
                      onClick={() => raise.mutate(e.id)}
                    >
                      Dispute
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Entries open when a document is signed and sent.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
