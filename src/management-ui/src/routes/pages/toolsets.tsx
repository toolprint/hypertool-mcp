import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const mockToolsets = [
  { name: "local-dev", delegate: "standard", toolCount: 14, active: true },
  { name: "persona:frontend", delegate: "persona", toolCount: 9, active: false }
];

export default function ToolsetsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Toolsets</CardTitle>
            <CardDescription>Drive `list-saved-toolsets` and `get-active-toolset`</CardDescription>
          </div>
          <Button size="sm">Create toolset</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Delegate</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockToolsets.map((toolset) => (
                <TableRow key={toolset.name} className={toolset.active ? "bg-primary/5" : undefined}>
                  <TableCell className="font-medium">{toolset.name}</TableCell>
                  <TableCell>
                    <Badge variant={toolset.delegate === "persona" ? "secondary" : "outline"}>{toolset.delegate}</Badge>
                  </TableCell>
                  <TableCell>{toolset.toolCount}</TableCell>
                  <TableCell>
                    {toolset.active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button size="sm" variant="outline">
                      Equip
                    </Button>
                    <Button size="sm" variant="ghost">
                      View JSON
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
