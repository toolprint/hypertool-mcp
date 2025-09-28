import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Layers3, Cog, Users, ServerCog, Search } from "lucide-react";
import { NavigationMenu, NavigationMenuList } from "@/components/ui/navigation-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const navItems: Array<{ path: string; label: string; icon: ReactNode }> = [
  { path: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { path: "/servers", label: "Servers", icon: <ServerCog className="h-4 w-4" /> },
  { path: "/tools", label: "Tool Catalog", icon: <Search className="h-4 w-4" /> },
  { path: "/toolsets", label: "Toolsets", icon: <Layers3 className="h-4 w-4" /> },
  { path: "/personas", label: "Personas", icon: <Users className="h-4 w-4" /> },
  { path: "/config", label: "Config", icon: <Cog className="h-4 w-4" /> }
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 border-r bg-card/40 p-4 lg:flex lg:flex-col">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Hypertool</p>
            <h1 className="text-xl font-bold">Management UI</h1>
          </div>
          <ThemeToggle />
        </div>
        <Separator className="my-4" />
        <ScrollArea className="flex-1">
          <nav className="space-y-1 pr-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </ScrollArea>
        <div className="mt-4 space-y-2">
          <Button variant="outline" size="sm" className="w-full">
            Launch MCP Inspector
          </Button>
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground">
            Documentation
          </Button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <NavigationMenu>
              <NavigationMenuList className="hidden gap-2 lg:flex">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      cn(
                        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                        isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )
                    }
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="outline" size="sm" className="lg:hidden">
                Menu
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
