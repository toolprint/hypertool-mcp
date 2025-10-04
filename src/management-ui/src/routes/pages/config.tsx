import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const mockConfig = {
  mode: "standard",
  paths: {
    config: "~/hypertool/mcp.json",
    personas: "~/hypertool/personas/",
    cache: "~/hypertool/cache"
  },
  notes: "Configuration values are read-only; use CLI for edits."
};

export default function ConfigPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Resolved paths from Hypertool runtime</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="paths" className="w-full">
            <TabsList>
              <TabsTrigger value="paths">Paths</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="paths" className="mt-4 space-y-3">
              {Object.entries(mockConfig.paths).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium capitalize">{key}</p>
                    <p className="font-mono text-xs text-muted-foreground">{value}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">
                      Copy
                    </Button>
                    <Button size="sm" variant="ghost">
                      Open
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="details" className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-medium">Mode</p>
                <Badge variant="secondary">{mockConfig.mode}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{mockConfig.notes}</p>
              <Button size="sm" variant="outline">
                Enter configuration mode
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
