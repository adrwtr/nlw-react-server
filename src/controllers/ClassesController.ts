import { Request, Response } from 'express';
import db from '../database/connection';
import convertHourToMinutes from '../utils/convertHourToMinutes';

interface IUser {
  name: string;
  avatar: string;
  whatsapp: string;
  bio: string;
  id: number;
}

interface IClass {
  subject: string;
  cost: number;
  id: number;
  user_id: number;
}

interface IClassSchedule {
  week_day: number;
  from: number;
  to: number;
  id: number;
  class_id: number;
}

export default class ClassesController {
  // metodo get
  async index(req: Request, res: Response) {
    const filters = req.query;
    if (!filters.subject || !filters.week_day || !filters.time) {
      return res
        .status(400)
        .json({ error: 'Não foram enviados os filtros corretos' });
    }
    const { subject, week_day, time } = filters as {
      subject: string;
      week_day: string;
      time: string;
    };
    const timeInMinutes = convertHourToMinutes(time);
    // try {
    const classes = await db('classes')
      .whereExists(function () {
        this.select('class_schedule.*')
          .from('class_schedule')
          .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
          .whereRaw('`class_schedule`.`week_day` = ??', [Number(week_day)])
          .whereRaw('`class_schedule`.`from` <= ??', [timeInMinutes])
          .whereRaw('`class_schedule`.`to` > ??', [timeInMinutes]);
      })
      .where('classes.subject', '=', subject)
      .join('users', 'classes.user_id', '=', 'users.id')
      .select(['classes.*', 'users.*']);
    return res.send(classes);
    // } catch (error) {
    //   res.status(400).send({ error });
    // }
  }

  async create(req: Request, res: Response) {
    const { name, avatar, whatsapp, bio, subject, cost, schedule } = req.body;
    const trx = await db.transaction();

    try {
      const insertedUsersIds: IUser[] = await trx('users').insert<IUser[]>({
        name,
        avatar,
        whatsapp,
        bio,
      });

      const insertedClassesIds: IClass[] = await trx('classes')
        .insert<IClass[]>({
          subject,
          cost,
          user_id: insertedUsersIds[0],
      });

      const classSchedule = schedule.map(
        ({
          week_day,
          from,
          to,
        }: {
          week_day: string;
          from: string;
          to: string;
        }) => {
          return {
            class_id: insertedClassesIds[0],
            week_day,
            from: convertHourToMinutes(from),
            to: convertHourToMinutes(to),
          };
        }
      );

      await trx.table('class_schedule')
        .insert<IClassSchedule>(classSchedule);

      await trx.commit();

      return res.status(201).send();
    } catch (error) {
      await trx.rollback();
      return res
        .status(400)
        .json({ message: 'Erro ao criar nova classe', error });
    }
  }
}