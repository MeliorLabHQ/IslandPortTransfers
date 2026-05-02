import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  MapPin, 
  DollarSign, 
  Tag, 
  Users, 
  Building2,
  LogOut,
  Settings,
  Mail,
  UserCog,
  Palette,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const menuItems = [
  { title: "Bookings", url: "/admin/bookings", icon: BookOpen },
  { title: "Drivers", url: "/admin/drivers", icon: Users },
  { title: "Hotels", url: "/admin/hotels", icon: Building2 },
  { title: "Zones", url: "/admin/zones", icon: MapPin },
  { title: "Rates", url: "/admin/rates", icon: DollarSign },
  { title: "Pricing Rules", url: "/admin/pricing-rules", icon: Tag },
  { title: "Emails", url: "/admin/emails", icon: Mail },
  { title: "Settings", url: "/admin/settings", icon: Settings },
  { title: "Property", url: "/admin/property", icon: Palette },
  { title: "Admin Users", url: "/admin/users", icon: UserCog },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: admin, isLoading } = useQuery<{ id: string; username: string; email: string; role?: string; property?: { id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string } }>({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation("/admin/login");
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!admin) {
    setLocation("/admin/login");
    return null;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-lg font-heading font-semibold px-4 py-3" data-testid="text-property-name">
                {admin?.property?.name || "Admin"}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}
                        className={location === item.url ? "bg-sidebar-accent" : ""}
                      >
                        <Link href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <div className="px-4 py-3 border-t">
                  <div className="text-sm font-medium">{admin.username}</div>
                  <div className="text-xs text-muted-foreground">{admin.email}</div>
                  <Button
                    data-testid="button-logout"
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
