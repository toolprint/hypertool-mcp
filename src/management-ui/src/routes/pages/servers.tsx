import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const mockServers = [
  {
    name: "git",
    transport: "http",
    endpoint: "http://localhost:7001",
    tools: ["git.status", "git.diff"],
    status: "available"
  },
  {
    name: "linear",
    transport: "http",
    endpoint: "https://api.linear.app/mcp",
    tools: ["linear.issueCreate"],
    status: "unavailable"
  }
];

export default function ServersPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configured Servers</CardTitle>
          <CardDescription>Data mirrors list-available-tools + get-active-toolset</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Transport</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockServers.map((server) => (
                <TableRow key={server.name}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell>{server.transport}</TableCell>
                  <TableCell className="font-mono text-xs">{server.endpoint}</TableCell>
                  <TableCell>{server.tools.join(", ")}</TableCell>
                  <TableCell>
                    <Badge variant={server.status === "available" ? "success" : "destructive"}>{server.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost">
                      Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
