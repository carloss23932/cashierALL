import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Edit, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Cashiers = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => window.api.listUsers() });

  const createMutation = useMutation({
    mutationFn: (p: any) => window.api.createUser(p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
  const updateMutation = useMutation({
    mutationFn: (p: any) => window.api.updateUser(p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => window.api.deleteUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ username: "", name: "", password: "", confirm: "", role: "cashier" });

  const currentUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("currentUser");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ username: "", name: "", password: "", confirm: "", role: "cashier" });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username) {
      toast({ title: "تنبيه", description: "اسم المستخدم مطلوب.", variant: "destructive" });
      return;
    }
    if (!editing && (!form.password || form.password !== form.confirm)) {
      toast({ title: "تنبيه", description: "كلمة المرور مطلوبة ويجب أن تتطابق مع التأكيد.", variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          username: form.username,
          name: form.name,
          password: form.password || undefined,
          role: form.role,
          actorRole: currentUser?.role,
        });
      } else {
        await createMutation.mutateAsync({
          username: form.username,
          name: form.name,
          password: form.password,
          role: form.role,
          actorRole: currentUser?.role,
        });
      }
      setIsDialogOpen(false);
      toast({ title: "تم الحفظ", description: "تم حفظ بيانات المستخدم بنجاح." });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "خطأ",
        description: err?.message || "حدث خطأ أثناء حفظ المستخدم.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (u: any) => {
    setEditing(u);
    setForm({ username: u.username || "", name: u.name || "", password: "", confirm: "", role: u.role || "cashier" });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "تم الحذف", description: "تم حذف المستخدم." });
    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message || "تعذر حذف المستخدم.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-blue-800">إدارة الموظفين / البائعين</h2>
        <Button className="flex items-center" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> إضافة بائع جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users.map((u: any) => (
          <Card key={u.id} className="bg-white/80 backdrop-blur-sm border-blue-100">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>{u.name || u.username}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => handleEdit(u)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" onClick={() => handleDelete(u.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600">اسم المستخدم: {u.username}</div>
              <div className="text-sm text-gray-600">الدور: {u.role}</div>
              <div className="text-xs text-gray-500">تاريخ الإضافة: {new Date(u.createdAt).toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل بائع" : "إضافة بائع جديد"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="text-right">
                اسم المستخدم *
              </Label>
              <Input id="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="name" className="text-right">
                الاسم
              </Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="password" className="text-right">
                كلمة المرور {editing ? "(اختياري عند التعديل)" : "*"}
              </Label>
              <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="confirm" className="text-right">
                تأكيد كلمة المرور
              </Label>
              <Input id="confirm" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500">
                حفظ
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cashiers;
