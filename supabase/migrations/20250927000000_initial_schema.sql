

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."inviter_type" AS ENUM (
    'operator',
    'customer',
    'salon'
);


ALTER TYPE "public"."inviter_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_slot"("p_slot_date" "date", "p_slot_time" time without time zone) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
    v_operator_id uuid := auth.uid();
    v_operator_name text;
begin
    -- 担当者名を取得
    select operator_name into v_operator_name from public.operators where operator_id = v_operator_id;

    -- 予約枠を挿入 (重複した場合は何もしない)
    insert into public.slots (operator_id, operator_name, slot_date, slot_time, is_booked)
    values (v_operator_id, v_operator_name, p_slot_date, p_slot_time, false)
    on conflict (operator_id, slot_date, slot_time) do nothing;
end;
$$;


ALTER FUNCTION "public"."add_slot"("p_slot_date" "date", "p_slot_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bulk_add_slots"("p_weekdays" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_interval_minutes" integer, "p_target_month" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_operator_id UUID := auth.uid();
  v_salon_id UUID;
  v_slot_date DATE; -- 変数名を変更
  v_slot_time TIME; -- 変数名を変更
BEGIN
  -- 実行ユーザーのsalon_idをoperatorsテーブルから取得
  SELECT salon_id INTO v_salon_id
  FROM public.operators
  WHERE operator_id = v_operator_id;

  IF v_salon_id IS NULL THEN
    RAISE EXCEPTION 'Operator not found or salon_id is missing';
  END IF;

  FOR v_slot_date IN -- 変更した変数名を使用
    SELECT generate_series(
      date_trunc('month', p_target_month),
      date_trunc('month', p_target_month) + interval '1 month' - interval '1 day',
      interval '1 day'
    )::date
  LOOP
    IF v_slot_date >= current_date AND EXTRACT(ISODOW FROM v_slot_date) = ANY(p_weekdays) THEN
      FOR v_slot_time IN -- 変更した変数名を使用
        SELECT (generate_series(
          ('2000-01-01 ' || p_start_time)::timestamp,
          ('2000-01-01 ' || p_end_time)::timestamp - (p_interval_minutes * interval '1 minute'),
          (p_interval_minutes * interval '1 minute')
        ))::time
      LOOP
        INSERT INTO public.slots (operator_id, salon_id, slot_date, slot_time, is_booked)
        SELECT v_operator_id, v_salon_id, v_slot_date, v_slot_time, false
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.slots
          WHERE operator_id = v_operator_id
            -- ★ 修正点: 変数名を変えたことで曖昧さが解消される
            AND slots.slot_date = v_slot_date
            AND slots.slot_time = v_slot_time
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."bulk_add_slots"("p_weekdays" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_interval_minutes" integer, "p_target_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_create_reservation"() RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  cancel_count integer;
  -- キャンセルの上限回数（この値で調整可能）
  cancel_limit integer := 5;
  -- チェックする期間（この値で調整可能）
  time_window interval := '24 hours';
BEGIN
  -- 認証されていないユーザーからの呼び出しはエラーとする
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- 現在のユーザーIDを使い、指定期間内のキャンセル回数を数える
  SELECT
    count(*)
  INTO
    cancel_count
  FROM
    public.reservations
  WHERE
    customer_id = auth.uid() AND
    status = 'canceled' AND
    -- updated_atは予約が更新された日時を記録します
    updated_at > (now() - time_window);

  -- キャンセル回数が上限未満であればtrue（予約可）、そうでなければfalse（予約不可）を返す
  RETURN cancel_count < cancel_limit;
END;
$$;


ALTER FUNCTION "public"."can_create_reservation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_reservation_and_free_slot"("p_reservation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_reservation record;
  v_duration integer;
  v_slot_interval integer := 15; -- 予約枠の間隔（分）
  v_slots_to_free integer;
  current_slot_time time;
  i integer;
BEGIN
  -- 1. キャンセル対象の予約情報を取得
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE reservation_id = p_reservation_id;

  -- 予約が存在しない場合はエラー
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  -- 2. reservationsテーブルのステータスを'canceled'に更新
  UPDATE public.reservations
  SET
    status = 'canceled',
    is_canceled = true,
    updated_at = now()
  WHERE reservation_id = p_reservation_id;

  -- 3. メニューから施術時間を取得
  SELECT duration_minutes INTO v_duration
  FROM public.menus
  WHERE id = v_reservation.menu_id;

  -- 施術時間に必要な予約枠の数を計算
  v_slots_to_free := CEIL(v_duration::decimal / v_slot_interval);

  -- 4. 施術時間分のslotsテーブルの予約枠(is_booked)をfalseに戻す
  current_slot_time := v_reservation.reservation_time;
  FOR i IN 1..v_slots_to_free LOOP
    UPDATE public.slots
    SET is_booked = false
    WHERE
      salon_id = v_reservation.salon_id AND
      operator_id = v_reservation.operator_id AND
      slot_date = v_reservation.reservation_date AND
      slot_time = current_slot_time;

    -- 次の予約枠の時刻を計算
    current_slot_time := current_slot_time + (v_slot_interval * interval '1 minute');
  END LOOP;

END;
$$;


ALTER FUNCTION "public"."cancel_reservation_and_free_slot"("p_reservation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_reservation_and_book_slots"("p_customer_id" "uuid", "p_operator_id" "uuid", "p_salon_id" "uuid", "p_menu_id" "uuid", "p_reservation_date" "date", "p_reservation_time" time without time zone, "p_gel_removal" boolean, "p_off_price" integer, "p_other_requests" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_duration integer;
  v_slot_interval integer := 15; -- 予約枠の間隔（分）
  v_slots_to_book integer;
  current_slot_time time;
  i integer;
BEGIN
  -- 予約対象のメニューから施術時間を取得
  SELECT duration_minutes INTO v_duration FROM public.menus WHERE id = p_menu_id;

  -- 施術時間に必要な予約枠の数を計算
  -- 例: 60分メニューで15分枠なら 60 / 15 = 4枠
  v_slots_to_book := CEIL(v_duration::decimal / v_slot_interval);

  -- 1. reservations テーブルに新しい予約を挿入
  INSERT INTO public.reservations (
    customer_id, operator_id, salon_id, menu_id, reservation_date,
    reservation_time, gel_removal, off_price, other_requests, status
  ) VALUES (
    p_customer_id, p_operator_id, p_salon_id, p_menu_id, p_reservation_date,
    p_reservation_time, p_gel_removal, p_off_price, p_other_requests, 'reserved'
  );

  -- 2. 施術時間分のslotsを更新
  current_slot_time := p_reservation_time;
  FOR i IN 1..v_slots_to_book LOOP
    UPDATE public.slots
    SET is_booked = true
    WHERE
      salon_id = p_salon_id AND
      operator_id = p_operator_id AND
      slot_date = p_reservation_date AND
      slot_time = current_slot_time;

    -- 次の予約枠の時刻を計算
    current_slot_time := current_slot_time + (v_slot_interval * interval '1 minute');
  END LOOP;

END;
$$;


ALTER FUNCTION "public"."create_reservation_and_book_slots"("p_customer_id" "uuid", "p_operator_id" "uuid", "p_salon_id" "uuid", "p_menu_id" "uuid", "p_reservation_date" "date", "p_reservation_time" time without time zone, "p_gel_removal" boolean, "p_off_price" integer, "p_other_requests" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_slot"("p_slot_date" "date", "p_slot_time" time without time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    DELETE FROM public.slots
    WHERE
        operator_id = auth.uid()
        AND slot_date = p_slot_date
        AND slot_time = p_slot_time
        AND is_booked = false; -- 予約済みの枠は削除できない安全策は維持
END;
$$;


ALTER FUNCTION "public"."delete_slot"("p_slot_date" "date", "p_slot_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_slots_for_date"("p_slot_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    DELETE FROM public.slots
    WHERE
        operator_id = auth.uid()
        AND slot_date = p_slot_date
        AND is_booked = false; -- 予約済みの枠は保護する
END;
$$;


ALTER FUNCTION "public"."delete_slots_for_date"("p_slot_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_my_operator_reservations"() RETURNS TABLE("reservation_id" "uuid", "reservation_date" "date", "reservation_time" time without time zone, "status" "text", "other_requests" "text", "gel_removal" boolean, "customer_name" "text", "customer_picture_url" "text", "menu_name" "text", "menu_price_without_off" integer, "menu_price_with_off" numeric)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    requesting_operator_salon_id UUID;
BEGIN
    -- 1. このリクエストを行っている運営者のsalon_idを取得します
    SELECT salon_id INTO requesting_operator_salon_id
    FROM public.operators
    WHERE operator_id = auth.uid();

    -- 2. そのサロンIDに紐づく全ての予約情報を返します
    RETURN QUERY
    SELECT
        r.reservation_id,
        r.reservation_date,
        r.reservation_time,
        r.status,
        r.other_requests,
        r.gel_removal, -- このカラムがboolean型
        p.display_name AS customer_name,
        p.picture_url AS customer_picture_url,
        m.name AS menu_name,
        m.price_without_tax AS menu_price_without_off,
        -- 金額の計算結果は整数とは限らないため、numericにキャスト
        (m.price_without_tax + r.off_price)::numeric AS menu_price_with_off
    FROM
        public.reservations AS r
    LEFT JOIN 
        public.profiles AS p ON r.customer_id = p.id
    LEFT JOIN 
        public.menus AS m ON r.menu_id = m.id
    -- ★ WHERE句にr.operator_idの条件を追加して、その運営者の予約のみを取得するように修正
    WHERE 
        r.operator_id IN (SELECT operator_id FROM public.operators WHERE salon_id = requesting_operator_salon_id);
END;
$$;


ALTER FUNCTION "public"."get_all_my_operator_reservations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_reservation_stats"("p_customer_id" "uuid") RETURNS TABLE("completed_count" bigint, "canceled_count" bigint, "noshow_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Use the FILTER clause with COUNT for an efficient way to get conditional counts in one pass.
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
        COUNT(*) FILTER (WHERE status = 'canceled') AS canceled_count,
        COUNT(*) FILTER (WHERE status = 'noshow') AS noshow_count
    FROM
        public.reservations
    WHERE
        customer_id = p_customer_id;
END;
$$;


ALTER FUNCTION "public"."get_customer_reservation_stats"("p_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invitation_details"("p_token" "text") RETURNS TABLE("salon_id" "uuid", "salon_name" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.salon_id,
    s.salon_name
  FROM public.invitations i
  JOIN public.salons s ON i.salon_id = s.salon_id
  WHERE i.token = p_token
    AND i.status = 'pending'
    AND i.expires_at > now();
END;
$$;


ALTER FUNCTION "public"."get_invitation_details"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_operator_reservations"() RETURNS TABLE("reservation_id" "uuid", "reservation_date" "date", "reservation_time" time without time zone, "status" "text", "status_name" "text", "gel_removal" boolean, "other_requests" "text", "customer_name" "text", "menu_name" "text")
    LANGUAGE "plpgsql"
    AS $$
begin
    -- auth.uid() を使って、現在ログインしている担当者のIDを取得
    return query
    select
        r.reservation_id,
        r.reservation_date,
        r.reservation_time,
        r.status,
        r.status_name,
        r.gel_removal,
        r.other_requests,
        p.display_name, -- profilesテーブルから顧客名を取得
        m.name          -- menusテーブルからメニュー名を取得
    from
        public.reservations as r
    -- 顧客情報を結合
    left join
        public.profiles as p on r.line_user_id = p.line_user_id
    -- メニュー情報を結合
    left join
        public.menus as m on r.menu_id = m.id
    where
        r.operator_id = auth.uid() and -- ログイン担当者の予約に限定
        r.reservation_date >= current_date; -- 本日以降の予約に限定
end;
$$;


ALTER FUNCTION "public"."get_my_operator_reservations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_reservations"("p_line_user_id" "text") RETURNS TABLE("reservation_id" "uuid", "operator_id" "uuid", "line_user_id" "text", "reservation_date" "date", "reservation_time" time without time zone, "status" "text", "status_name" "text", "gel_removal" boolean, "menu_id" "uuid", "other_requests" "text", "operator_name" "text", "menu_name" "text", "menu_description" "text", "menu_price_with_off" numeric, "menu_price_without_off" numeric, "menu_image_url" "text", "cancellation_deadline_minutes" integer)
    LANGUAGE "plpgsql"
    AS $$
begin
    return query
    select
        r.reservation_id,
        r.operator_id,
        r.line_user_id,
        r.reservation_date,
        r.reservation_time,
        r.status,
        r.status_name,
        r.gel_removal,
        r.menu_id,
        r.other_requests,
        o.operator_name,
        m.name,
        m.description,
        m.price_with_off,
        m.price_without_off,
        m.image_url,
        -- ▼▼▼ 修正点: operatorsテーブルからキャンセル期限を取得 ▼▼▼
        o.cancellation_deadline_minutes
    from
        public.reservations as r
    left join
        public.operators as o on r.operator_id = o.operator_id
    left join
        public.menus as m on r.menu_id = m.id
    where
        r.line_user_id = p_line_user_id;
end;
$$;


ALTER FUNCTION "public"."get_my_reservations"("p_line_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_reservations_with_salon_details"() RETURNS TABLE("reservation_id" "uuid", "menu_id" "uuid", "reservation_date" "date", "reservation_time" time without time zone, "status" "text", "is_canceled" boolean, "menu_name" "text", "salon_name" "text", "operator_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- ログインしているユーザーのIDを取得
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    r.reservation_id,
    r.menu_id, -- この行を追加
    r.reservation_date,
    r.reservation_time,
    r.status,
    r.is_canceled,
    m.name AS menu_name,
    s.salon_name,
    o.operator_name
  FROM
    public.reservations AS r
  LEFT JOIN
    public.menus AS m ON r.menu_id = m.id
  LEFT JOIN
    public.salons AS s ON r.salon_id = s.salon_id
  LEFT JOIN
    public.operators AS o ON r.operator_id = o.operator_id
  WHERE
    r.customer_id = auth.uid()
  ORDER BY
    r.reservation_date DESC, r.reservation_time DESC;
END;
$$;


ALTER FUNCTION "public"."get_my_reservations_with_salon_details"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_salon_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      -- まず、お客様としてsalon_idを探す
      (SELECT salon_id FROM public.salon_customers WHERE customer_id = auth.uid()),
      -- もしお客様で見つからなければ、運営者としてsalon_idを探す
      (SELECT salon_id FROM public.operators WHERE operator_id = auth.uid())
    )
  );
END;
$$;


ALTER FUNCTION "public"."get_my_salon_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_slots"() RETURNS TABLE("slot_date" "date", "slot_time" time without time zone, "is_booked" boolean)
    LANGUAGE "plpgsql"
    AS $$
begin
    return query
    select
        s.slot_date,
        s.slot_time,
        s.is_booked
    from
        public.slots as s
    where
        s.operator_id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."get_my_slots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_notification_read_status"("p_notification_id" "uuid") RETURNS TABLE("customer_name" "text", "read_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.display_name,
    nr.read_at
  FROM
    public.notifications n
  JOIN
    public.profiles p ON n.customer_id = p.id
  LEFT JOIN
    public.notification_reads nr ON n.id = nr.notification_id AND p.id = nr.customer_id
  WHERE
    n.id = p_notification_id;
END;
$$;


ALTER FUNCTION "public"."get_notification_read_status"("p_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_notifications_for_customer"("p_customer_id" "uuid") RETURNS TABLE("id" "uuid", "salon_id" "uuid", "operator_id" "uuid", "title" "text", "content" "text", "created_at" timestamp with time zone, "published_at" timestamp with time zone, "is_published" boolean, "is_read" boolean, "total_unread_count" bigint, "target_customer_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH relevant_notifications AS (
        -- First, find all notifications relevant to the user (salon-wide and personal)
        SELECT
            n.id,
            n.salon_id,
            n.operator_id,
            n.title,
            n.content,
            n.created_at,
            n.published_at,
            n.is_published,
            (nr.notification_id IS NOT NULL) AS is_read,
            n.customer_id AS target_customer_id
        FROM
            public.notifications n
        LEFT JOIN
            public.notification_reads nr ON n.id = nr.notification_id AND nr.customer_id = p_customer_id
        WHERE
            n.is_published = true
            AND (
                -- Salon-wide notifications for any salon the customer belongs to
                (n.customer_id IS NULL AND n.salon_id IN (SELECT sc.salon_id FROM public.salon_customers sc WHERE sc.customer_id = p_customer_id))
                -- Or personal notifications sent directly to the customer
                OR (n.customer_id = p_customer_id)
            )
    ),
    unread_count AS (
        -- Then, count how many of those relevant notifications are unread
        SELECT count(*) AS total
        FROM relevant_notifications
        WHERE relevant_notifications.is_read = false
    )
    -- Finally, return all relevant notifications, attaching the total unread count to each row
    -- FIX: Select columns explicitly to match the RETURNS TABLE definition and avoid order/type mismatch.
    SELECT
        rn.id,
        rn.salon_id,
        rn.operator_id,
        rn.title,
        rn.content,
        rn.created_at,
        rn.published_at,
        rn.is_published,
        rn.is_read,
        uc.total AS total_unread_count,
        rn.target_customer_id
    FROM
        relevant_notifications rn,
        unread_count uc
    ORDER BY
        rn.published_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_notifications_for_customer"("p_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operator_auth_info_by_line_id"("p_line_user_id" "text") RETURNS TABLE("user_id" "uuid", "user_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RAISE NOTICE 'SQL関数が受け取ったp_line_user_id: >>%<<', p_line_user_id;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text AS user_email -- emailカラムをtext型に変換
  FROM public.operators AS o
  JOIN auth.users AS u ON o.operator_id = u.id
  WHERE o.line_user_id = p_line_user_id;
END;
$$;


ALTER FUNCTION "public"."get_operator_auth_info_by_line_id"("p_line_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_salon_customers"("p_salon_id" "uuid") RETURNS TABLE("customer_id" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.display_name
  FROM
    public.profiles p
  JOIN
    public.salon_customers sc ON p.id = sc.customer_id
  WHERE
    sc.salon_id = p_salon_id
  ORDER BY
    p.display_name;
END;
$$;


ALTER FUNCTION "public"."get_salon_customers"("p_salon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_salon_details"() RETURNS TABLE("salon_id" "uuid", "salon_name" "text", "address" "text", "access_info" "text", "phone_number" "text", "opening_hours" "jsonb", "payment_methods" "jsonb", "image_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.salon_id,
    s.salon_name,
    s.address,
    s.access_info,
    s.phone_number,
    s.opening_hours,
    s.payment_methods,
    s.image_url
  FROM public.salons s
  JOIN public.operators o ON s.salon_id = o.salon_id
  WHERE o.operator_id = auth.uid()
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_salon_details"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_by_email"("user_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = user_email;
  RETURN user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_by_email"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_by_line_id"("p_line_user_id" "text") RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT u.id FROM auth.users AS u
  WHERE u.raw_user_meta_data->>'line_user_id' = p_line_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_by_line_id"("p_line_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_by_provider_id"("p_provider_id" "text") RETURNS TABLE("id" "uuid", "email" "text", "app_metadata" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    u.id,
    u.email,
    u.raw_app_meta_data as app_metadata
  FROM
    auth.users AS u
  WHERE
    u.raw_app_meta_data->>'provider_id' = p_provider_id;
$$;


ALTER FUNCTION "public"."get_user_by_provider_id"("p_provider_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_salon_id UUID;
BEGIN
  -- サインアップ時に渡された `user_type` をメタデータから取得
  IF new.raw_user_meta_data->>'user_type' = 'operator' THEN
    -- 1. 新しいサロンを `salons` テーブルに作成
    INSERT INTO public.salons (salon_name)
    VALUES (new.raw_user_meta_data->>'salon_name')
    RETURNING salon_id INTO new_salon_id;

    -- 2. 新しい運営者を `operators` テーブルに作成
    INSERT INTO public.operators (operator_id, operator_name, email, salon_id, role)
    VALUES (
      new.id, -- auth.usersのID
      new.raw_user_meta_data->>'operator_name',
      new.email,
      new_salon_id,
      'admin' -- 最初の登録者は admin とする
    );

  ELSIF new.raw_user_meta_data->>'user_type' = 'customer' THEN
    -- お客様として登録された場合の処理
    INSERT INTO public.profiles (id, display_name, email)
    VALUES (
      new.id, -- auth.usersのID
      new.raw_user_meta_data->>'display_name',
      new.email
    );
  END IF;
  
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_with_invitation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Edge Function(招待フロー)またはフロントエンド(運営者登録フロー)から渡された
  -- メタデータ(`raw_app_meta_data`)を取得します。
  
  -- 招待ID(`pending_invitation_id`)が存在する場合、後続のプロフィール作成トリガーが
  -- 参照できるように `raw_user_meta_data` にその値をコピーします。
  IF NEW.raw_app_meta_data->>'pending_invitation_id' IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
      'pending_invitation_id', NEW.raw_app_meta_data->>'pending_invitation_id'
    )
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_with_invitation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_new_user_invitation"("p_display_name" "text", "p_invitation_id" "uuid", "p_line_user_id" "text", "p_picture_url" "text", "p_status_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- ステップ1: profilesテーブルにお客様情報を登録
    INSERT INTO public.profiles (line_user_id, display_name, picture_url, status_message)
    VALUES (p_line_user_id, p_display_name, p_picture_url, p_status_message)
    ON CONFLICT (line_user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        picture_url = EXCLUDED.picture_url,
        status_message = EXCLUDED.status_message,
        updated_at = now();

    -- ステップ2: invitationsテーブルを更新して招待を「完了」にする
    UPDATE public.invitations
    SET
        invitee_id = p_line_user_id,
        status = 'completed',
        completed_at = now()
    WHERE id = p_invitation_id;

END;
$$;


ALTER FUNCTION "public"."process_new_user_invitation"("p_display_name" "text", "p_invitation_id" "uuid", "p_line_user_id" "text", "p_picture_url" "text", "p_status_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_new_user_invitation"("p_invitation_id" "uuid", "p_line_user_id" "text", "p_display_name" "text", "p_picture_url" "text", "p_status_message" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- ステップ1: profilesテーブルにお客様情報を登録（存在する場合は更新）
    INSERT INTO public.profiles (line_user_id, display_name, picture_url, status_message)
    VALUES (p_line_user_id, p_display_name, p_picture_url, p_status_message)
    ON CONFLICT (line_user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        picture_url = EXCLUDED.picture_url,
        status_message = EXCLUDED.status_message,
        updated_at = now();

    -- ステップ2: invitationsテーブルを更新して招待を「完了」にする
    UPDATE public.invitations
    SET
        invitee_id = p_line_user_id,
        status = 'completed',
        completed_at = now()
    WHERE id = p_invitation_id;

END;
$$;


ALTER FUNCTION "public"."process_new_user_invitation"("p_invitation_id" "uuid", "p_line_user_id" "text", "p_display_name" "text", "p_picture_url" "text", "p_status_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_complete_invitation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  pending_invitation_id UUID;
BEGIN
  -- Get the invitation ID we stored earlier from the user's metadata.
  SELECT raw_user_meta_data->>'pending_invitation_id'
  INTO pending_invitation_id
  FROM auth.users
  WHERE id = NEW.id;
  
  -- If an invitation ID exists, finalize the process.
  IF pending_invitation_id IS NOT NULL THEN
    -- Step 1: Link the customer to the salon by inserting a row in `salon_customers`.
    INSERT INTO public.salon_customers(customer_id, salon_id)
    SELECT NEW.id, i.salon_id
    FROM public.invitations i
    WHERE i.id = pending_invitation_id;

    -- Step 2: Update the invitation's status to 'completed'.
    UPDATE public.invitations
    SET
      status = 'completed',
      invitee_id = NEW.id,
      completed_at = now()
    WHERE id = pending_invitation_id;

    -- Step 3 (Cleanup): Remove the temporary ID from the user's metadata.
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data - 'pending_invitation_id'
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_complete_invitation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_salon_details"("p_salon_name" "text", "p_address" "text", "p_access_info" "text", "p_phone_number" "text", "p_opening_hours" "jsonb", "p_payment_methods" "jsonb", "p_image_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_salon_id uuid;
BEGIN
  -- ログイン中の運営者が所属するサロンIDを取得
  SELECT salon_id INTO v_salon_id
  FROM public.operators
  WHERE operator_id = auth.uid();

  IF v_salon_id IS NULL THEN
    RAISE EXCEPTION 'Operator not found or not associated with a salon';
  END IF;

  -- salons テーブルを更新
  UPDATE public.salons
  SET
    salon_name = p_salon_name,
    address = p_address,
    access_info = p_access_info,
    phone_number = p_phone_number,
    opening_hours = p_opening_hours,
    payment_methods = p_payment_methods,
    image_url = p_image_url
  WHERE salon_id = v_salon_id;
END;
$$;


ALTER FUNCTION "public"."update_salon_details"("p_salon_name" "text", "p_address" "text", "p_access_info" "text", "p_phone_number" "text", "p_opening_hours" "jsonb", "p_payment_methods" "jsonb", "p_image_url" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."customer_karutes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "preferred_colors" character varying(500),
    "design_preferences" character varying(500),
    "designs_to_avoid" character varying(500),
    "lifestyle_notes" character varying(500),
    "counseling_notes" character varying(500),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lifestyle_hobby" character varying(500)
);


ALTER TABLE "public"."customer_karutes" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_karutes" IS '顧客のカルテ情報';



COMMENT ON COLUMN "public"."customer_karutes"."preferred_colors" IS '好みの色';



COMMENT ON COLUMN "public"."customer_karutes"."design_preferences" IS 'デザインの傾向、好きなスタイル';



COMMENT ON COLUMN "public"."customer_karutes"."designs_to_avoid" IS '避けたいデザイン';



COMMENT ON COLUMN "public"."customer_karutes"."counseling_notes" IS 'カウンセリングでの会話内容など';



COMMENT ON COLUMN "public"."customer_karutes"."lifestyle_hobby" IS 'ライフスタイルや趣味など';



CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inviter_id" "text" NOT NULL,
    "invitee_id" "uuid",
    "salon_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "inviter_type" "public"."inviter_type"
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."invitations" IS 'ユーザー間の招待イベントを記録するテーブル';



CREATE TABLE IF NOT EXISTS "public"."karute_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "karute_id" "uuid" NOT NULL,
    "photo_url" "text" NOT NULL,
    "caption" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."karute_photos" OWNER TO "postgres";


COMMENT ON TABLE "public"."karute_photos" IS '顧客カルテに紐づく写真ギャラリー';



CREATE TABLE IF NOT EXISTS "public"."menu_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_division_associations" (
    "menu_id" "uuid" NOT NULL,
    "division_id" "uuid" NOT NULL
);


ALTER TABLE "public"."menu_division_associations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_divisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_divisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price_without_tax" integer NOT NULL,
    "duration_minutes" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "image_url" "text",
    "category_id" "uuid",
    "discount_amount" integer,
    "valid_from" "date",
    "valid_until" "date"
);


ALTER TABLE "public"."menus" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_reads" (
    "notification_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_reads" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_reads" IS 'お客様ごとのお知らせ既読状態を管理';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "operator_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    "is_published" boolean DEFAULT false NOT NULL,
    "customer_id" "uuid"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'サロンからのお知らせを格納するテーブル';



COMMENT ON COLUMN "public"."notifications"."customer_id" IS 'NULLの場合はサロン全体、特定の値が入っている場合はその顧客個人へのお知らせ';



CREATE TABLE IF NOT EXISTS "public"."operators" (
    "operator_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "operator_name" "text" DEFAULT '''''''新規運営者''''::text'''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Tokyo'::"text", "now"()),
    "is_active" boolean DEFAULT true,
    "salon_name" "text",
    "cancellation_deadline_minutes" integer DEFAULT 1440,
    "salon_id" "uuid",
    "role" "text" DEFAULT 'member'::"text",
    "account_id" "text",
    "password_change_required" boolean DEFAULT false,
    "line_user_id" "text",
    "email" "text",
    CONSTRAINT "operators_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."operators" OWNER TO "postgres";


COMMENT ON TABLE "public"."operators" IS '運営者を管理するテーブル';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "display_name" "text",
    "picture_url" "text",
    "status_message" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('Asia/Tokyo'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "auth_user_id" "uuid",
    "id" "uuid" NOT NULL,
    "email" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'profiles TBL';



CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "operator_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "reservation_date" "date",
    "reservation_time" time without time zone,
    "status" "text" DEFAULT 'reserved'::"text",
    "created_at" timestamp without time zone DEFAULT "timezone"('Asia/Tokyo'::"text", "now"()),
    "is_canceled" boolean DEFAULT false,
    "other_requests" "text",
    "reservation_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('Asia/Tokyo'::"text", "now"()),
    "menu_id" "uuid",
    "gel_removal" boolean,
    "off_price" integer DEFAULT 0,
    "salon_id" "uuid" NOT NULL
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


COMMENT ON TABLE "public"."reservations" IS 'Reservations Table';



CREATE TABLE IF NOT EXISTS "public"."salon_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "salon_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."salon_customers" OWNER TO "postgres";


COMMENT ON TABLE "public"."salon_customers" IS '顧客とサロンの関係を管理する中間テーブル';



CREATE TABLE IF NOT EXISTS "public"."salons" (
    "salon_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "salon_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'Asia/Tokyo'::"text"),
    "plan" "text" DEFAULT '''basic''::text'::"text",
    "address" "text",
    "access_info" "text",
    "phone_number" "text",
    "opening_hours" "jsonb",
    "payment_methods" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text"
);


ALTER TABLE "public"."salons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slots" (
    "operator_id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "slot_date" "date" NOT NULL,
    "slot_time" time without time zone NOT NULL,
    "is_booked" boolean DEFAULT false,
    "operator_name" "text",
    "created_at" timestamp without time zone,
    "salon_id" "uuid" NOT NULL
);


ALTER TABLE "public"."slots" OWNER TO "postgres";


COMMENT ON TABLE "public"."slots" IS '予約可能日時の管理';



ALTER TABLE ONLY "public"."customer_karutes"
    ADD CONSTRAINT "customer_karutes_customer_id_key" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."customer_karutes"
    ADD CONSTRAINT "customer_karutes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."karute_photos"
    ADD CONSTRAINT "karute_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_division_associations"
    ADD CONSTRAINT "menu_division_associations_pkey" PRIMARY KEY ("menu_id", "division_id");



ALTER TABLE ONLY "public"."menu_divisions"
    ADD CONSTRAINT "menu_divisions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."menu_divisions"
    ADD CONSTRAINT "menu_divisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id", "customer_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operators"
    ADD CONSTRAINT "operators_account_id_key" UNIQUE ("account_id");



ALTER TABLE ONLY "public"."operators"
    ADD CONSTRAINT "operators_pkey" PRIMARY KEY ("operator_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("reservation_id");



ALTER TABLE ONLY "public"."salon_customers"
    ADD CONSTRAINT "salon_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salons"
    ADD CONSTRAINT "salons_pkey" PRIMARY KEY ("salon_id");



ALTER TABLE ONLY "public"."slots"
    ADD CONSTRAINT "slots_pkey" PRIMARY KEY ("operator_id", "slot_date", "slot_time");



CREATE OR REPLACE TRIGGER "on_menus_update" BEFORE UPDATE ON "public"."menus" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_profile_created_complete_invitation" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_complete_invitation"();



CREATE OR REPLACE TRIGGER "on_salons_update" BEFORE UPDATE ON "public"."salons" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."customer_karutes"
    ADD CONSTRAINT "customer_karutes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_karutes"
    ADD CONSTRAINT "customer_karutes_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("salon_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("salon_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."karute_photos"
    ADD CONSTRAINT "karute_photos_karute_id_fkey" FOREIGN KEY ("karute_id") REFERENCES "public"."customer_karutes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_division_associations"
    ADD CONSTRAINT "menu_division_associations_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."menu_divisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_division_associations"
    ADD CONSTRAINT "menu_division_associations_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("salon_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("operator_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("salon_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operators"
    ADD CONSTRAINT "operators_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("salon_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("operator_id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("salon_id");



ALTER TABLE ONLY "public"."salon_customers"
    ADD CONSTRAINT "salon_customers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."salon_customers"
    ADD CONSTRAINT "salon_customers_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("salon_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slots"
    ADD CONSTRAINT "slots_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("salon_id") ON DELETE CASCADE;



CREATE POLICY "Allow anon insert" ON "public"."slots" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon select" ON "public"."slots" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow anon update" ON "public"."slots" FOR UPDATE TO "anon" USING (("auth"."uid"() = "operator_id")) WITH CHECK (("auth"."uid"() = "operator_id"));



CREATE POLICY "Allow authenticated users to insert salons" ON "public"."salons" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow booking a slot" ON "public"."slots" FOR UPDATE TO "authenticated", "anon" USING (("is_booked" = false)) WITH CHECK (true);



CREATE POLICY "Allow new users to insert their own operator record" ON "public"."operators" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "operator_id"));



CREATE POLICY "Allow operators to update their own data" ON "public"."operators" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "operator_id")) WITH CHECK (("auth"."uid"() = "operator_id"));



CREATE POLICY "Allow operators to update their own salon" ON "public"."salons" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."operators"
  WHERE (("operators"."salon_id" = "salons"."salon_id") AND ("operators"."operator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."operators"
  WHERE (("operators"."salon_id" = "salons"."salon_id") AND ("operators"."operator_id" = "auth"."uid"())))));



CREATE POLICY "Allow operators to view their own salon" ON "public"."salons" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."operators"
  WHERE (("operators"."salon_id" = "salons"."salon_id") AND ("operators"."operator_id" = "auth"."uid"())))));



CREATE POLICY "Allow read access to everyone" ON "public"."slots" FOR SELECT USING (true);



CREATE POLICY "Customers can manage their own read status" ON "public"."notification_reads" USING (("customer_id" = "auth"."uid"())) WITH CHECK (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers can view relevant notifications" ON "public"."notifications" FOR SELECT USING ((("is_published" = true) AND ((("customer_id" IS NULL) AND ("salon_id" IN ( SELECT "salon_customers"."salon_id"
   FROM "public"."salon_customers"
  WHERE ("salon_customers"."customer_id" = "auth"."uid"())))) OR ("customer_id" = "auth"."uid"()))));



CREATE POLICY "Enable update for anon and authenticated" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Operators can manage karutes for their salon's customers" ON "public"."customer_karutes" USING (("salon_id" IN ( SELECT "op"."salon_id"
   FROM "public"."operators" "op"
  WHERE ("op"."operator_id" = "auth"."uid"()))));



CREATE POLICY "Operators can manage notifications for their salon" ON "public"."notifications" USING (("salon_id" = ( SELECT "operators"."salon_id"
   FROM "public"."operators"
  WHERE ("operators"."operator_id" = "auth"."uid"()))));



CREATE POLICY "Operators can manage photos for their salon's karutes" ON "public"."karute_photos" USING (("karute_id" IN ( SELECT "ck"."id"
   FROM "public"."customer_karutes" "ck"
  WHERE ("ck"."salon_id" IN ( SELECT "op"."salon_id"
           FROM "public"."operators" "op"
          WHERE ("op"."operator_id" = "auth"."uid"()))))));



CREATE POLICY "TEMP - Allow any authenticated to insert to invitations" ON "public"."invitations" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."customer_karutes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."karute_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menus" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profilesテーブルへのpublicな読み取りアクセスを" ON "public"."profiles" FOR SELECT USING (true);



ALTER TABLE "public"."salon_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ユーザーは所属サロンの担当者情報のみ閲覧可" ON "public"."operators" FOR SELECT TO "authenticated" USING (("salon_id" = "public"."get_my_salon_id"()));



CREATE POLICY "招待情報の読み取りを許可" ON "public"."invitations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."operators"
  WHERE (("operators"."operator_id" = "auth"."uid"()) AND ("operators"."salon_id" = "invitations"."salon_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."id" = "invitations"."invitee_id"))))));



CREATE POLICY "認証ユーザーによるメニューの読み取りを許可" ON "public"."menus" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "認証済みのサロン運営者が参照できる" ON "public"."salon_customers" FOR SELECT USING (("salon_id" = ( SELECT "o"."salon_id"
   FROM "public"."operators" "o"
  WHERE ("o"."operator_id" = "auth"."uid"()))));



CREATE POLICY "運営者は自身のサロンのメニューのみ削除可能" ON "public"."menus" FOR DELETE USING (("salon_id" IN ( SELECT "operators"."salon_id"
   FROM "public"."operators"
  WHERE ("operators"."operator_id" = "auth"."uid"()))));



CREATE POLICY "運営者は自身のサロンのメニューのみ更新可能" ON "public"."menus" FOR UPDATE USING (("salon_id" IN ( SELECT "operators"."salon_id"
   FROM "public"."operators"
  WHERE ("operators"."operator_id" = "auth"."uid"()))));



CREATE POLICY "運営者は自身のサロンのメニューのみ登録可能" ON "public"."menus" FOR INSERT TO "authenticated" WITH CHECK (("salon_id" = ( SELECT "operators"."salon_id"
   FROM "public"."operators"
  WHERE ("operators"."operator_id" = "auth"."uid"()))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."add_slot"("p_slot_date" "date", "p_slot_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."add_slot"("p_slot_date" "date", "p_slot_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_slot"("p_slot_date" "date", "p_slot_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."bulk_add_slots"("p_weekdays" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_interval_minutes" integer, "p_target_month" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."bulk_add_slots"("p_weekdays" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_interval_minutes" integer, "p_target_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bulk_add_slots"("p_weekdays" integer[], "p_start_time" time without time zone, "p_end_time" time without time zone, "p_interval_minutes" integer, "p_target_month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_create_reservation"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_create_reservation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_create_reservation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_reservation_and_free_slot"("p_reservation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_reservation_and_free_slot"("p_reservation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_reservation_and_free_slot"("p_reservation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_reservation_and_book_slots"("p_customer_id" "uuid", "p_operator_id" "uuid", "p_salon_id" "uuid", "p_menu_id" "uuid", "p_reservation_date" "date", "p_reservation_time" time without time zone, "p_gel_removal" boolean, "p_off_price" integer, "p_other_requests" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_reservation_and_book_slots"("p_customer_id" "uuid", "p_operator_id" "uuid", "p_salon_id" "uuid", "p_menu_id" "uuid", "p_reservation_date" "date", "p_reservation_time" time without time zone, "p_gel_removal" boolean, "p_off_price" integer, "p_other_requests" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_reservation_and_book_slots"("p_customer_id" "uuid", "p_operator_id" "uuid", "p_salon_id" "uuid", "p_menu_id" "uuid", "p_reservation_date" "date", "p_reservation_time" time without time zone, "p_gel_removal" boolean, "p_off_price" integer, "p_other_requests" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_slot"("p_slot_date" "date", "p_slot_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_slot"("p_slot_date" "date", "p_slot_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_slot"("p_slot_date" "date", "p_slot_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_slots_for_date"("p_slot_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_slots_for_date"("p_slot_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_slots_for_date"("p_slot_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_my_operator_reservations"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_my_operator_reservations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_my_operator_reservations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_reservation_stats"("p_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_reservation_stats"("p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_reservation_stats"("p_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invitation_details"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invitation_details"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invitation_details"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_operator_reservations"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_operator_reservations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_operator_reservations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_reservations"("p_line_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_reservations"("p_line_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_reservations"("p_line_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_reservations_with_salon_details"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_reservations_with_salon_details"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_reservations_with_salon_details"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_salon_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_salon_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_salon_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_slots"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_slots"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_slots"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_notification_read_status"("p_notification_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_notification_read_status"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_notification_read_status"("p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_notifications_for_customer"("p_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_notifications_for_customer"("p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_notifications_for_customer"("p_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_operator_auth_info_by_line_id"("p_line_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_operator_auth_info_by_line_id"("p_line_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operator_auth_info_by_line_id"("p_line_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_salon_customers"("p_salon_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_salon_customers"("p_salon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_salon_customers"("p_salon_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_salon_details"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_salon_details"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_salon_details"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_by_email"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_by_email"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_by_email"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_by_line_id"("p_line_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_by_line_id"("p_line_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_by_line_id"("p_line_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_by_provider_id"("p_provider_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_by_provider_id"("p_provider_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_by_provider_id"("p_provider_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_with_invitation"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_with_invitation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_with_invitation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_new_user_invitation"("p_display_name" "text", "p_invitation_id" "uuid", "p_line_user_id" "text", "p_picture_url" "text", "p_status_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_new_user_invitation"("p_display_name" "text", "p_invitation_id" "uuid", "p_line_user_id" "text", "p_picture_url" "text", "p_status_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_new_user_invitation"("p_display_name" "text", "p_invitation_id" "uuid", "p_line_user_id" "text", "p_picture_url" "text", "p_status_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_new_user_invitation"("p_invitation_id" "uuid", "p_line_user_id" "text", "p_display_name" "text", "p_picture_url" "text", "p_status_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_new_user_invitation"("p_invitation_id" "uuid", "p_line_user_id" "text", "p_display_name" "text", "p_picture_url" "text", "p_status_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_new_user_invitation"("p_invitation_id" "uuid", "p_line_user_id" "text", "p_display_name" "text", "p_picture_url" "text", "p_status_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_complete_invitation"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_complete_invitation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_complete_invitation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_salon_details"("p_salon_name" "text", "p_address" "text", "p_access_info" "text", "p_phone_number" "text", "p_opening_hours" "jsonb", "p_payment_methods" "jsonb", "p_image_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_salon_details"("p_salon_name" "text", "p_address" "text", "p_access_info" "text", "p_phone_number" "text", "p_opening_hours" "jsonb", "p_payment_methods" "jsonb", "p_image_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_salon_details"("p_salon_name" "text", "p_address" "text", "p_access_info" "text", "p_phone_number" "text", "p_opening_hours" "jsonb", "p_payment_methods" "jsonb", "p_image_url" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."customer_karutes" TO "anon";
GRANT ALL ON TABLE "public"."customer_karutes" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_karutes" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."karute_photos" TO "anon";
GRANT ALL ON TABLE "public"."karute_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."karute_photos" TO "service_role";



GRANT ALL ON TABLE "public"."menu_categories" TO "anon";
GRANT ALL ON TABLE "public"."menu_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_categories" TO "service_role";



GRANT ALL ON TABLE "public"."menu_division_associations" TO "anon";
GRANT ALL ON TABLE "public"."menu_division_associations" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_division_associations" TO "service_role";



GRANT ALL ON TABLE "public"."menu_divisions" TO "anon";
GRANT ALL ON TABLE "public"."menu_divisions" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_divisions" TO "service_role";



GRANT ALL ON TABLE "public"."menus" TO "anon";
GRANT ALL ON TABLE "public"."menus" TO "authenticated";
GRANT ALL ON TABLE "public"."menus" TO "service_role";



GRANT ALL ON TABLE "public"."notification_reads" TO "anon";
GRANT ALL ON TABLE "public"."notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."operators" TO "anon";
GRANT ALL ON TABLE "public"."operators" TO "authenticated";
GRANT ALL ON TABLE "public"."operators" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "anon";
GRANT ALL ON TABLE "public"."reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."salon_customers" TO "anon";
GRANT ALL ON TABLE "public"."salon_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."salon_customers" TO "service_role";



GRANT ALL ON TABLE "public"."salons" TO "anon";
GRANT ALL ON TABLE "public"."salons" TO "authenticated";
GRANT ALL ON TABLE "public"."salons" TO "service_role";



GRANT ALL ON TABLE "public"."slots" TO "anon";
GRANT ALL ON TABLE "public"."slots" TO "authenticated";
GRANT ALL ON TABLE "public"."slots" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
