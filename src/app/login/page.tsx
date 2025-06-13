
'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState(''); // Can be username or email for staff
  const [password, setPassword] = useState('');
  const { signIn, loading } = useAuth(); // signIn in context still expects email
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      toast({
        title: 'Error de Ingreso',
        description: 'Por favor, ingresa tu nombre de usuario y contraseña.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      // Attempt to find user by username in 'users' collection
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', identifier.trim()), limit(1));
      const querySnapshot = await getDocs(q);

      let userEmailToAuth: string | null = null;

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0].data();
        if (userDoc.email) {
          userEmailToAuth = userDoc.email;
        } else {
          toast({
            title: 'Fallo de Ingreso',
            description: 'La cuenta de usuario no está configurada correctamente (falta correo electrónico). Por favor, contacta a soporte.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }
      } else {
         // Fallback: if not found by username, try if identifier itself is an email (e.g. for staff)
         // This allows staff to login with email if they don't have/use a username or if student enters email
         if (identifier.includes('@')) {
            userEmailToAuth = identifier.trim();
         } else {
            toast({
                title: 'Fallo de Ingreso',
                description: 'Nombre de usuario no encontrado.',
                variant: 'destructive',
            });
            setIsSubmitting(false);
            return;
         }
      }

      if (!userEmailToAuth) {
        // Should not happen if logic above is correct, but as a safeguard
        toast({
            title: 'Fallo de Ingreso',
            description: 'No se pudo determinar el correo electrónico para la autenticación.',
            variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      await signIn(userEmailToAuth, password);
      toast({
        title: 'Ingreso Exitoso',
        description: '¡Bienvenido/a de nuevo!',
      });
      // Router will redirect via AuthContext effect
    } catch (error: any) {
      console.error("Login Page Error:", error); 
      let errorMessage = 'Fallo al ingresar. Por favor, verifica tus credenciales o inténtalo más tarde.'; 

      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Nombre de usuario o contraseña incorrectos.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'El formato del correo electrónico asociado al nombre de usuario no es válido.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'Esta cuenta de usuario ha sido deshabilitada.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'El método de inicio de sesión no está habilitado. Por favor, contacta a soporte.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Ocurrió un error de red. Por favor, verifica tu conexión a internet e inténtalo de nuevo.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'El acceso a esta cuenta ha sido deshabilitado temporalmente debido a muchos intentos fallidos. Intenta más tarde o restablece tu contraseña.';
          break;
        case 'auth/invalid-api-key':
           errorMessage = 'Error de configuración del sistema. Por favor, contacta a soporte. (API Key Inválida)';
           break;
        case 'auth/app-deleted':
            errorMessage = 'Error de configuración del sistema. Por favor, contacta a soporte. (App Eliminada)';
            break;
        case 'auth/app-not-authorized':
            errorMessage = 'Error de configuración del sistema. Por favor, contacta a soporte. (App No Autorizada para el dominio)';
            break;
        case 'auth/visibility-check-was-unavailable':
            errorMessage = 'No se pudo verificar la visibilidad de la aplicación. Esto podría ser un problema temporal o debido a la configuración/extensiones del navegador. Por favor, inténtalo de nuevo. Si persiste, intenta deshabilitar las extensiones del navegador o verifica la configuración de privacidad.';
            break;
        default:
          console.warn("Unhandled Firebase Auth error code during login:", error.code, error.message);
          if (error.message && typeof error.message === 'string' && !error.message.includes('INTERNAL ASSERTION FAILED')) {
            errorMessage = error.message; 
          }
          break;
      }
      toast({
        title: 'Fallo de Ingreso',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentLoadingState = loading || isSubmitting;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <LogIn className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold">SERVEX Login</CardTitle>
          <CardDescription>Accede a tu panel de gestión de asistencia.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="identifier">Nombre de Usuario</Label>
              <Input
                id="identifier"
                type="text" 
                placeholder="Ingresa tu nombre de usuario"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={currentLoadingState}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={currentLoadingState}
              />
            </div>
            <Button type="submit" className="w-full" disabled={currentLoadingState}>
              {currentLoadingState ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Ingresar'
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center text-sm">
           <p className="text-muted-foreground">¿No tienes una cuenta?</p>
           <div className="mt-2"> {/* Reduced margin from mt-4 to mt-2 for tighter spacing */}
            <Button variant="outline" asChild>
              <Link href="/signup">
                <UserPlus className="mr-2 h-4 w-4" />
                Crear una Cuenta
              </Link>
            </Button>
           </div>
        </CardFooter>
      </Card>
    </div>
  );
}
