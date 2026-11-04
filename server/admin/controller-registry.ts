import Ajax from './controller/ajax';
import AuthAdmin from './controller/auth/admin';
import AuthAdminlog from './controller/auth/adminlog';
import AuthGroup from './controller/auth/group';
import AuthRule from './controller/auth/rule';
import CrudCrud from './controller/crud/crud';
import CrudLog from './controller/crud/log';
import Dashboard from './controller/dashboard';
import DemoNote from './controller/demo/note';
import Index from './controller/index';
import Module from './controller/module';
import RoutineAdmininfo from './controller/routine/admininfo';
import RoutineAttachment from './controller/routine/attachment';
import RoutineConfig from './controller/routine/config';
import SampleType from './controller/sample/type';
import SecurityDatarecycle from './controller/security/datarecycle';
import SecurityDatarecyclelog from './controller/security/datarecyclelog';
import SecuritySensitivedata from './controller/security/sensitivedata';
import SecuritySensitivedatalog from './controller/security/sensitivedatalog';
import UserGroup from './controller/user/group';
import UserMoneylog from './controller/user/moneylog';
import UserRule from './controller/user/rule';
import UserScorelog from './controller/user/scorelog';
import UserUser from './controller/user/user';
import type { AdminController } from './crud.controller';

const controllers: Array<new () => AdminController> = [
    Ajax,
    AuthAdmin,
    AuthAdminlog,
    AuthGroup,
    AuthRule,
    CrudCrud,
    CrudLog,
    Dashboard,
    DemoNote,
    Index,
    Module,
    RoutineAdmininfo,
    RoutineAttachment,
    RoutineConfig,
    SampleType,
    SecurityDatarecycle,
    SecurityDatarecyclelog,
    SecuritySensitivedata,
    SecuritySensitivedatalog,
    UserGroup,
    UserMoneylog,
    UserRule,
    UserScorelog,
    UserUser,
];

export default controllers;
