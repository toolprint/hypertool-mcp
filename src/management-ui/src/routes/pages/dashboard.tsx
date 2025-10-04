import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const mockSummary = {
  activeToolset: "local-dev",
  persona: "none",
  totals: {
    available: 12,
    unavailable: 2,
    disabled: 1
  }
};

const mockServers = [
  { name: "git", status: "available", tools: 5 },
  { name: "linear", status: "unavailable", tools: 3 },
  { name: "notion", status: "available", tools: 4 }
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Active Toolset</CardTitle>
            <CardDescription>Currently equipped toolset</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-lg font-semibold">{mockSummary.activeToolset}</span>
            <Button size="sm" variant="outline">
              Equip different toolset
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Persona</CardTitle>
            <CardDescription>Persona delegate in use</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Badge variant={mockSummary.persona === "none" ? "outline" : "default"}>{mockSummary.persona}</Badge>
            <Button size="sm" variant="secondary">
              Manage personas
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Server Health</CardTitle>
            <CardDescription>Derived from get-active-toolset</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Badge variant="success">{mockSummary.totals.available} available</Badge>
            <Badge variant="destructive">{mockSummary.totals.unavailable} unavailable</Badge>
            <Badge>{mockSummary.totals.disabled} disabled</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server Status</CardTitle>
          <CardDescription>Quick overview of downstream MCP servers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockServers.map((server) => (
              <div key={server.name} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{server.name}</p>
                    <p className="text-sm text-muted-foreground">{server.tools} exposed tools</p>
                  </div>
                  <Badge variant={server.status === "available" ? "success" : "destructive"}>{server.status}</Badge>
                </div>
                <Separator className="my-3" />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Inspect configuration</span>
                  <Button variant="ghost" size="sm">
                    View details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
