import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { PermissionsAdminService } from "./permissions-admin.service";
const COOKIE = "wtp_admin_session";
function token(req: Request) { const h=req.headers.cookie??""; const x=h.split(";").map(v=>v.trim()).find(v=>v.startsWith(COOKIE+"=")); return x?decodeURIComponent(x.slice(COOKIE.length+1)):undefined; }
@Controller("admin/permissions")
export class PermissionsAdminController {
  constructor(private readonly auth: AdminAuthService, private readonly service: PermissionsAdminService) {}
  @Get("catalog") async catalog(@Req() req:Request){const a=await this.auth.getCurrentAdmin(token(req));return this.service.catalog(a.id);}
  @Get("roles") async roles(@Req() req:Request,@Query("search") search?:string,@Query("status") status?:string){const a=await this.auth.getCurrentAdmin(token(req));return this.service.roles(a.id,search,status);}
  @Post("roles") async createRole(@Req() req:Request,@Body() body:{name:string;description?:string;status?:string;permissionKeys?:string[]}){const a=await this.auth.getCurrentAdmin(token(req));return this.service.createRole(a.id,body);}
  @Patch("roles/:id") async updateRole(@Req() req:Request,@Param("id") id:string,@Body() body:{name?:string;description?:string;status?:string;permissionKeys?:string[]}){const a=await this.auth.getCurrentAdmin(token(req));return this.service.updateRole(a.id,id,body);}
  @Get("admins") async admins(@Req() req:Request,@Query("search") search?:string,@Query("status") status?:string){const a=await this.auth.getCurrentAdmin(token(req));return this.service.admins(a.id,search,status);}
  @Post("admins") async createAdmin(@Req() req:Request,@Body() body:{name:string;email:string;login:string;phone?:string;password:string;roleIds:string[]}){const a=await this.auth.getCurrentAdmin(token(req));return this.service.createAdmin(a.id,body);}
  @Patch("admins/:id") async updateAdmin(@Req() req:Request,@Param("id") id:string,@Body() body:{name?:string;phone?:string;status?:string}){const a=await this.auth.getCurrentAdmin(token(req));return this.service.updateAdmin(a.id,id,body);}
  @Patch("admins/:id/roles") async assignRoles(@Req() req:Request,@Param("id") id:string,@Body() body:{roleIds:string[]}){const a=await this.auth.getCurrentAdmin(token(req));return this.service.assignRoles(a.id,id,body.roleIds);}
  @Post("admins/:id/reset-password") async resetPassword(@Req() req:Request,@Param("id") id:string,@Body() body:{password:string}){const a=await this.auth.getCurrentAdmin(token(req));return this.service.resetPassword(a.id,id,body.password);}
  @Post("admins/:id/revoke-sessions") async revokeSessions(@Req() req:Request,@Param("id") id:string){const a=await this.auth.getCurrentAdmin(token(req));return this.service.revokeSessions(a.id,id);}
}
