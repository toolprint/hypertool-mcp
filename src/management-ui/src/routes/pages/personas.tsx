import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const mockPersonas = [
  {
    id: "frontend-dev",
    name: "Frontend Developer",
    description: "Bundles docs, git, and browser automation tools",
    toolsets: ["frontend-default", "frontend-testing"],
    active: false
  },
  {
    id: "research",
    name: "Research Companion",
    description: "Curated browsing and note taking setup",
    toolsets: ["research-default"],
    active: true
  }
];

export default function PersonasPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personas</CardTitle>
          <CardDescription>Visualizes persona delegates available to Hypertool</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {mockPersonas.map((persona) => (
              <AccordionItem key={persona.id} value={persona.id}>
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{persona.name}</span>
                    {persona.active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground">{persona.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {persona.toolsets.map((toolset) => (
                      <Badge key={toolset} variant="secondary">
                        {toolset}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant={persona.active ? "outline" : "default"}>
                      {persona.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button size="sm" variant="ghost">
                      View manifest
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
