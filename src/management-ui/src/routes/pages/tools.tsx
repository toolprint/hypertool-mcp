import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const mockTools = [
  { name: "git.status", server: "git", description: "Check current repository status" },
  { name: "git.diff", server: "git", description: "Show diff for the current branch" },
  { name: "linear.createIssue", server: "linear", description: "Create issue in Linear" },
  { name: "notion.appendBlock", server: "notion", description: "Append block to a page" }
];

export default function ToolsPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return mockTools.filter((tool) => tool.name.toLowerCase().includes(lower) || tool.server.toLowerCase().includes(lower));
  }, [query]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Tool Catalog</CardTitle>
            <CardDescription>Browse tools discovered across all connected servers</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or server" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[520px]">
            <ul className="space-y-3 pr-4">
              {filtered.map((tool) => (
                <li key={tool.name} className="rounded-lg border p-3 transition hover:border-primary">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{tool.name}</p>
                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                    </div>
                    <Badge className={cn("uppercase")}>{tool.server}</Badge>
                  </div>
                </li>
              ))}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground">No tools match your search yet.</p>}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
