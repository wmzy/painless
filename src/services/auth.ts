import * as http from '@/util/http';

export async function login(email: string, password: string) {
  return http
    .post<{user: unknown}>('users/login', {user: {email, password}})
    .then(({user}) => user);
}

export async function register(
  username: string,
  email: string,
  password: string
) {
  return http
    .post<{user: unknown}>('users', {user: {username, email, password}})
    .then(({user}) => user);
}
