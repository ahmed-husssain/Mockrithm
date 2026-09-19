"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDoc, collection } from "firebase/firestore";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { db } from "@/firebase/client";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }),
  type: z.enum(["Bug Report", "Feature Request", "General Feedback"], {
    required_error: "Please select a feedback type",
  }),
  message: z
    .string()
    .min(10, { message: "Message must be at least 10 characters." })
    .max(1000),
});

export default function FeedbackForm() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      type: undefined,
      message: "",
    },
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user) {
      const name = user.fullName || user.firstName || "User";
      form.setValue("name", name);
      form.setValue("email", user.primaryEmailAddress?.emailAddress || "");
    }
  }, [isLoaded, isSignedIn, user, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      try {
        await addDoc(collection(db, "feedback"), {
          ...values,
          createdAt: new Date(),
        });
      } catch (firestoreErr) {
        // Fallback to server API route if client Firestore rejects unauthenticated writes
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!res.ok) throw firestoreErr;
      }
      toast.success("Thanks for your feedback! We will get back to you shortly.");
      form.reset({ name: values.name, email: values.email, type: undefined, message: "" });
    } catch (error) {
      console.error("Feedback error:", error);
      toast.error("Something went wrong. Please try again or email support@mockrithm.me.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-zinc-400 text-xs font-semibold">Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="John Doe"
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-white/20 h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-zinc-400 text-xs font-semibold">Email</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="john@example.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-white/20 h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-zinc-400 text-xs font-semibold">Feedback Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-white/20 h-11">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="Bug Report" className="focus:bg-white/10 cursor-pointer">Bug Report</SelectItem>
                  <SelectItem value="Feature Request" className="focus:bg-white/10 cursor-pointer">Feature Request</SelectItem>
                  <SelectItem value="General Feedback" className="focus:bg-white/10 cursor-pointer">General Feedback</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-zinc-400 text-xs font-semibold">Message</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="How can we help you?"
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-white/20 min-h-[120px] resize-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-white text-black hover:bg-zinc-200 h-11 font-semibold transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" /> Send Message
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
